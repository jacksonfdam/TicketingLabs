// Package usecase contains the business rules. It depends only on the domain and on
// the port interfaces declared here. Concrete adapters (Postgres, Redis, RabbitMQ)
// implement these ports and are injected at wiring time. The dependency arrow points
// inward: adapters depend on use cases, never the reverse.
package usecase

import (
	"context"
	"time"

	"github.com/ticketing-labs/backend-go/internal/domain"
)

// --- Persistence ports -------------------------------------------------------

type UserRepository interface {
	FindByEmail(ctx context.Context, email string) (*domain.User, error)
	FindByID(ctx context.Context, id string) (*domain.User, error)
}

type EventRepository interface {
	List(ctx context.Context, cursor string, limit int) ([]domain.Event, string, error)
	FindByID(ctx context.Context, id string) (*domain.Event, error)
}

type SectorRepository interface {
	ListByEvent(ctx context.Context, eventID string) ([]domain.Sector, error)
	FindByID(ctx context.Context, id string) (*domain.Sector, error)
	// DecrementInventory atomically subtracts qty only if enough remains. It returns
	// false (not an error) when inventory is insufficient. This conditional UPDATE is
	// the real guarantee against overselling; the distributed lock is belt and braces.
	DecrementInventory(ctx context.Context, sectorID string, qty int) (bool, error)
	IncrementInventory(ctx context.Context, sectorID string, qty int) error
}

type QueueRepository interface {
	Upsert(ctx context.Context, token *domain.QueueToken) error
	Find(ctx context.Context, userID, eventID string) (*domain.QueueToken, error)
	NextPosition(ctx context.Context, eventID string) (int, error)
}

type ReservationRepository interface {
	Create(ctx context.Context, r *domain.Reservation) error
	FindByID(ctx context.Context, id string) (*domain.Reservation, error)
	FindByIdempotencyKey(ctx context.Context, userID, key string) (*domain.Reservation, error)
	UpdateStatus(ctx context.Context, id string, status domain.ReservationStatus) error
	// FindExpired returns held reservations whose TTL has passed, for the sweeper.
	FindExpired(ctx context.Context, now time.Time, limit int) ([]domain.Reservation, error)
}

type OrderRepository interface {
	Create(ctx context.Context, o *domain.Order) error
	FindByID(ctx context.Context, id string) (*domain.Order, error)
	FindByReservationID(ctx context.Context, reservationID string) (*domain.Order, error)
	FindByIdempotencyKey(ctx context.Context, userID, key string) (*domain.Order, error)
	UpdateStatus(ctx context.Context, id string, status domain.OrderStatus) error
}

type PaymentRepository interface {
	// Upsert is idempotent by provider_ref so a replayed webhook is a no-op.
	Upsert(ctx context.Context, p *domain.Payment) error
	FindByOrderID(ctx context.Context, orderID string) (*domain.Payment, error)
}

// --- Infrastructure ports ----------------------------------------------------

// Locker is a distributed mutex. Acquire returns a release func and ok=false if the
// lock could not be taken within the ttl. The Redis adapter implements it with
// SET NX PX and a token-checked delete.
type Locker interface {
	Acquire(ctx context.Context, key string, ttl time.Duration) (release func(), ok bool, err error)
}

// Publisher enqueues a domain event/command onto the broker for async processing.
type Publisher interface {
	Publish(ctx context.Context, topic string, payload []byte) error
}

// RateLimiter reports whether an action under key is allowed within the window.
type RateLimiter interface {
	Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error)
}

// Clock and IDs are ports so use cases stay deterministic under test.
type Clock interface{ Now() time.Time }

type IDGenerator interface{ NewID() string }

// PasswordHasher verifies a plaintext password against a stored hash.
type PasswordHasher interface {
	Verify(hash, plaintext string) bool
}

// TokenService issues and validates the JWT access/refresh pair.
type TokenService interface {
	IssueAccess(userID string, role domain.Role) (token string, expiresIn int, err error)
	IssueRefresh(userID string) (token string, err error)
	// Rotate validates a refresh token, revokes it, and returns the user id. A reused
	// (already-revoked) token is rejected. This is refresh rotation, done properly.
	Rotate(ctx context.Context, refreshToken string) (userID string, err error)
	ParseAccess(token string) (userID string, role domain.Role, err error)
}
