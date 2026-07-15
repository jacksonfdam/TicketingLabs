package usecase

import (
	"context"

	"github.com/ticketing-labs/backend-go/internal/domain"
)

// PaymentGateway is the external provider (the fake one in this lab). Charge asks it
// to settle an order; the gateway later calls our webhook with the result.
type PaymentGateway interface {
	Charge(ctx context.Context, orderID string) (providerRef string, err error)
}

type PaymentService struct {
	orders       OrderRepository
	reservations ReservationRepository
	payments     PaymentRepository
	gateway      PaymentGateway
	ids          IDGenerator
}

func NewPaymentService(o OrderRepository, r ReservationRepository, p PaymentRepository, gw PaymentGateway, ids IDGenerator) *PaymentService {
	return &PaymentService{orders: o, reservations: r, payments: p, gateway: gw, ids: ids}
}

// ProcessPaymentRequest is called by the broker worker for each payment.requested
// message. It records a pending payment and asks the gateway to charge. The result
// arrives asynchronously via the webhook.
func (s *PaymentService) ProcessPaymentRequest(ctx context.Context, orderID string) error {
	order, err := s.orders.FindByID(ctx, orderID)
	if err != nil || order == nil {
		return domain.ErrNotFound
	}
	if order.Status != domain.OrderPending {
		return nil // already settled; the message is a duplicate, ignore it
	}
	providerRef, err := s.gateway.Charge(ctx, orderID)
	if err != nil {
		return err // the worker will retry with backoff
	}
	return s.payments.Upsert(ctx, &domain.Payment{
		ID:          s.ids.NewID(),
		OrderID:     orderID,
		ProviderRef: providerRef,
		Status:      domain.PaymentPending,
		Attempts:    1,
	})
}

// HandleWebhook settles an order from a verified provider callback. Signature
// verification happens at the transport edge before this is called. Idempotent by
// provider_ref: a replayed webhook does not double-confirm anything.
func (s *PaymentService) HandleWebhook(ctx context.Context, providerRef, orderID string, succeeded bool) error {
	order, err := s.orders.FindByID(ctx, orderID)
	if err != nil || order == nil {
		return domain.ErrNotFound
	}

	status := domain.PaymentFailed
	if succeeded {
		status = domain.PaymentSucceeded
	}
	if err := s.payments.Upsert(ctx, &domain.Payment{
		ID:          s.ids.NewID(),
		OrderID:     orderID,
		ProviderRef: providerRef,
		Status:      status,
	}); err != nil {
		return domain.ErrInternal
	}

	if order.Status != domain.OrderPending {
		return nil // already settled; nothing more to do
	}

	if succeeded {
		if err := s.orders.UpdateStatus(ctx, orderID, domain.OrderPaid); err != nil {
			return domain.ErrInternal
		}
		// The one place the two state machines touch: a paid order confirms its hold.
		return s.reservations.UpdateStatus(ctx, order.ReservationID, domain.ReservationConfirmed)
	}
	return s.orders.UpdateStatus(ctx, orderID, domain.OrderFailed)
}
