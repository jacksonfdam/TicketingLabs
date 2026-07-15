package usecase

import (
	"context"
	"time"

	"github.com/ticketing-labs/backend-go/internal/domain"
)

// QueueService is the pressure valve. Under a flash sale you cannot let everyone hit
// the reservation path at once, so they take a numbered ticket and wait. Only an
// admitted token may proceed to checkout; that gate is enforced by ReservationService.
type QueueService struct {
	queue   QueueRepository
	events  EventRepository
	limiter RateLimiter
	clock   Clock
	ids     IDGenerator
	// admitUpTo is the position below which tokens are considered admitted. In a real
	// system a background process raises this as capacity frees up; here it is a simple
	// batch size so the demo is deterministic.
	admitBatch int
}

func NewQueueService(q QueueRepository, e EventRepository, rl RateLimiter, c Clock, ids IDGenerator, admitBatch int) *QueueService {
	if admitBatch <= 0 {
		admitBatch = 50
	}
	return &QueueService{queue: q, events: e, limiter: rl, clock: c, ids: ids, admitBatch: admitBatch}
}

func (s *QueueService) Join(ctx context.Context, userID, eventID string) (*domain.QueueToken, error) {
	if _, err := s.events.FindByID(ctx, eventID); err != nil {
		return nil, domain.ErrNotFound
	}

	// Rate limit joins per user+event so a script cannot spam the queue endpoint.
	allowed, err := s.limiter.Allow(ctx, "queue_join:"+userID+":"+eventID, 5, time.Minute)
	if err == nil && !allowed {
		return nil, domain.ErrRateLimited
	}

	// Idempotent-ish: re-joining returns the existing token rather than a new place.
	if existing, err := s.queue.Find(ctx, userID, eventID); err == nil && existing != nil {
		return s.decorate(existing), nil
	}

	pos, err := s.queue.NextPosition(ctx, eventID)
	if err != nil {
		return nil, domain.ErrInternal
	}
	token := &domain.QueueToken{
		ID:       s.ids.NewID(),
		UserID:   userID,
		EventID:  eventID,
		Position: pos,
		Status:   domain.QueueWaiting,
	}
	if err := s.queue.Upsert(ctx, token); err != nil {
		return nil, domain.ErrInternal
	}
	return s.decorate(token), nil
}

func (s *QueueService) Status(ctx context.Context, userID, eventID string) (*domain.QueueToken, error) {
	token, err := s.queue.Find(ctx, userID, eventID)
	if err != nil || token == nil {
		return nil, domain.ErrNotFound
	}
	return s.decorate(token), nil
}

// decorate flips a waiting token to admitted once its position is within the batch,
// stamping admitted_at. This keeps admission logic in one place.
func (s *QueueService) decorate(t *domain.QueueToken) *domain.QueueToken {
	if t.Status == domain.QueueWaiting && t.Position < s.admitBatch {
		now := s.clock.Now()
		t.Status = domain.QueueAdmitted
		t.AdmittedAt = &now
		_ = s.queue.Upsert(context.Background(), t)
	}
	return t
}

// IsAdmitted is used by ReservationService to enforce the checkout gate.
func (s *QueueService) IsAdmitted(ctx context.Context, userID, eventID string) bool {
	t, err := s.queue.Find(ctx, userID, eventID)
	if err != nil || t == nil {
		return false
	}
	t = s.decorate(t)
	return t.Status == domain.QueueAdmitted
}
