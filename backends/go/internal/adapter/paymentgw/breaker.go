package paymentgw

import (
	"context"
	"sync"
	"time"

	"github.com/ticketing-labs/backend-go/internal/domain"
	"github.com/ticketing-labs/backend-go/internal/usecase"
)

// A circuit breaker guards the payment gateway. When the provider starts failing (the
// fake gateway can be flipped to fail/timeout at runtime), the breaker trips OPEN after
// a few consecutive failures and fast-fails every subsequent call for a cooldown,
// instead of piling more doomed requests onto a provider that is already down. After the
// cooldown it goes HALF-OPEN and lets a single trial through: success closes it, another
// failure re-opens it. This is the classic three-state breaker, hand-rolled so the
// recipe can point at every transition.
type state int

const (
	closed state = iota
	open
	halfOpen
)

type breaker struct {
	mu          sync.Mutex
	state       state
	failures    int
	threshold   int
	cooldown    time.Duration
	openedAt    time.Time
	halfOpenBusy bool
}

func newBreaker(threshold int, cooldown time.Duration) *breaker {
	return &breaker{state: closed, threshold: threshold, cooldown: cooldown}
}

// allow reports whether a call may proceed, advancing OPEN -> HALF-OPEN when the
// cooldown has elapsed.
func (b *breaker) allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	switch b.state {
	case open:
		if time.Since(b.openedAt) >= b.cooldown {
			b.state = halfOpen
			b.halfOpenBusy = true
			return true // the single trial call
		}
		return false
	case halfOpen:
		return false // a trial is already in flight
	default:
		return true
	}
}

func (b *breaker) success() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.failures = 0
	b.state = closed
	b.halfOpenBusy = false
}

func (b *breaker) failure() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.halfOpenBusy = false
	if b.state == halfOpen {
		b.state = open
		b.openedAt = time.Now()
		return
	}
	b.failures++
	if b.failures >= b.threshold {
		b.state = open
		b.openedAt = time.Now()
	}
}

// BreakerGateway wraps a PaymentGateway with the circuit breaker.
type BreakerGateway struct {
	inner   usecase.PaymentGateway
	breaker *breaker
}

func NewBreakerGateway(inner usecase.PaymentGateway, threshold int, cooldown time.Duration) *BreakerGateway {
	return &BreakerGateway{inner: inner, breaker: newBreaker(threshold, cooldown)}
}

func (g *BreakerGateway) Charge(ctx context.Context, orderID string) (string, error) {
	if !g.breaker.allow() {
		// Fast-fail: the provider is presumed down; do not even try. The worker will
		// retry later, by which point the cooldown may have elapsed.
		return "", domain.ErrLockUnavailable
	}
	ref, err := g.inner.Charge(ctx, orderID)
	if err != nil {
		g.breaker.failure()
		return "", err
	}
	g.breaker.success()
	return ref, nil
}

var _ usecase.PaymentGateway = (*BreakerGateway)(nil)
