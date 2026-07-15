package memory

import (
	"context"
	"sync"
	"time"

	"github.com/ticketing-labs/backend-go/internal/usecase"
)

// Locker is an in-process distributed-lock stand-in: a keyed mutex. It is correct
// within one process, which is exactly what the unit tests need. The Redis adapter
// provides the real cross-process version for production. Same port, different reach.
type Locker struct {
	mu    sync.Mutex
	locks map[string]*sync.Mutex
}

func NewLocker() *Locker { return &Locker{locks: map[string]*sync.Mutex{}} }

func (l *Locker) Acquire(_ context.Context, key string, _ time.Duration) (func(), bool, error) {
	l.mu.Lock()
	m, ok := l.locks[key]
	if !ok {
		m = &sync.Mutex{}
		l.locks[key] = m
	}
	l.mu.Unlock()

	m.Lock()
	return func() { m.Unlock() }, true, nil
}

var _ usecase.Locker = (*Locker)(nil)
