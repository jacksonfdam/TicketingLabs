package usecase

import (
	"context"
	"errors"
	"time"

	"github.com/ticketing-labs/backend-go/internal/domain"
)

// admissionChecker is the seam onto QueueService, kept as an interface so the
// reservation use case can be unit-tested without a real queue.
type admissionChecker interface {
	IsAdmitted(ctx context.Context, userID, eventID string) bool
}

// ReservationService is the most concept-dense code in the backend. In one method it
// combines: an idempotency guard, a distributed lock, an atomic conditional stock
// decrement, and a TTL hold. Read CreateReservation slowly; it is the whole point.
type ReservationService struct {
	reservations ReservationRepository
	sectors      SectorRepository
	locker       Locker
	admission    admissionChecker
	clock        Clock
	ids          IDGenerator
	ttl          time.Duration
	lockWait     time.Duration
}

func NewReservationService(
	r ReservationRepository, sec SectorRepository, l Locker, adm admissionChecker,
	c Clock, ids IDGenerator, ttl time.Duration,
) *ReservationService {
	if ttl <= 0 {
		ttl = 2 * time.Minute
	}
	return &ReservationService{
		reservations: r, sectors: sec, locker: l, admission: adm,
		clock: c, ids: ids, ttl: ttl, lockWait: 3 * time.Second,
	}
}

// CreateResult carries whether the reservation was freshly created (201) or an
// idempotent replay of a prior request (200).
type CreateResult struct {
	Reservation *domain.Reservation
	Replayed    bool
}

func (s *ReservationService) Create(ctx context.Context, userID, sectorID string, qty int, idemKey string) (*CreateResult, error) {
	if qty < 1 || qty > 8 || idemKey == "" {
		return nil, domain.ErrValidation
	}

	// (1) Idempotency, fast path. If we have already handled this key, return the
	// original reservation without touching inventory. Double-clicks are routine.
	if prior, err := s.reservations.FindByIdempotencyKey(ctx, userID, idemKey); err == nil && prior != nil {
		return &CreateResult{Reservation: prior, Replayed: true}, nil
	}

	sector, err := s.sectors.FindByID(ctx, sectorID)
	if err != nil {
		return nil, domain.ErrNotFound
	}

	// (2) Checkout gate. No admitted queue token for this sector's event, no entry.
	if !s.admission.IsAdmitted(ctx, userID, sector.EventID) {
		return nil, domain.ErrNotAdmitted
	}

	// (3) Distributed lock on the sector. This serialises writers for one sector so
	// concurrent buyers do not waste effort racing. It is NOT the correctness
	// guarantee (the conditional decrement below is); it is contention management and
	// it also closes the check-then-insert idempotency race for a single sector.
	release, ok, err := s.locker.Acquire(ctx, "sector:"+sectorID, s.lockWait)
	if err != nil {
		return nil, domain.ErrInternal
	}
	if !ok {
		return nil, domain.ErrLockUnavailable
	}
	defer release()

	// Re-check idempotency inside the lock: a racing request may have created the
	// reservation between our fast-path check and acquiring the lock.
	if prior, err := s.reservations.FindByIdempotencyKey(ctx, userID, idemKey); err == nil && prior != nil {
		return &CreateResult{Reservation: prior, Replayed: true}, nil
	}

	// (4) Atomic conditional decrement. Returns false, not an error, when there is
	// not enough left. This single UPDATE is what actually makes overselling
	// impossible; even if every lock above failed, Postgres would still refuse.
	decremented, err := s.sectors.DecrementInventory(ctx, sectorID, qty)
	if err != nil {
		return nil, domain.ErrInternal
	}
	if !decremented {
		return nil, domain.ErrInventoryExhausted
	}

	// (5) Create the hold with a TTL. If the user does not pay in time, the sweeper
	// flips it to expired and returns the stock.
	now := s.clock.Now()
	res := &domain.Reservation{
		ID:             s.ids.NewID(),
		UserID:         userID,
		SectorID:       sectorID,
		Quantity:       qty,
		Status:         domain.ReservationHeld,
		ExpiresAt:      now.Add(s.ttl),
		IdempotencyKey: idemKey,
		CreatedAt:      now,
	}
	if err := s.reservations.Create(ctx, res); err != nil {
		// Lost the insert race on the unique (user_id, idempotency_key) constraint:
		// another request with this key won. Give back the stock we took and return
		// the winner. Correctness survives even the narrow window the lock misses.
		_ = s.sectors.IncrementInventory(ctx, sectorID, qty)
		if errors.Is(err, domain.ErrConflict) {
			if prior, ferr := s.reservations.FindByIdempotencyKey(ctx, userID, idemKey); ferr == nil && prior != nil {
				return &CreateResult{Reservation: prior, Replayed: true}, nil
			}
		}
		return nil, domain.ErrInternal
	}
	return &CreateResult{Reservation: res, Replayed: false}, nil
}

// Release returns a held reservation's stock. Idempotent: releasing an already
// released or expired reservation is a no-op that still succeeds.
func (s *ReservationService) Release(ctx context.Context, userID, reservationID string) error {
	res, err := s.reservations.FindByID(ctx, reservationID)
	if err != nil || res == nil {
		return domain.ErrNotFound
	}
	if res.UserID != userID {
		// Do not confirm the resource exists to someone who does not own it.
		return domain.ErrNotFound
	}
	if res.Status != domain.ReservationHeld {
		return nil // already released/expired/confirmed: nothing to do, still 204
	}
	if err := s.reservations.UpdateStatus(ctx, res.ID, domain.ReservationReleased); err != nil {
		return domain.ErrInternal
	}
	if err := s.sectors.IncrementInventory(ctx, res.SectorID, res.Quantity); err != nil {
		return domain.ErrInternal
	}
	return nil
}

// SweepExpired flips held reservations past their TTL to expired and returns their
// stock. Run periodically by a background loop. Returns the number swept.
func (s *ReservationService) SweepExpired(ctx context.Context, limit int) (int, error) {
	expired, err := s.reservations.FindExpired(ctx, s.clock.Now(), limit)
	if err != nil {
		return 0, err
	}
	swept := 0
	for _, r := range expired {
		if err := s.reservations.UpdateStatus(ctx, r.ID, domain.ReservationExpired); err != nil {
			continue
		}
		if err := s.sectors.IncrementInventory(ctx, r.SectorID, r.Quantity); err != nil {
			continue
		}
		swept++
	}
	return swept, nil
}

func (s *ReservationService) Get(ctx context.Context, id string) (*domain.Reservation, error) {
	res, err := s.reservations.FindByID(ctx, id)
	if err != nil || res == nil {
		return nil, domain.ErrNotFound
	}
	return res, nil
}
