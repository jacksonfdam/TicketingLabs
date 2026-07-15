// Package memory provides in-process, thread-safe implementations of the use-case
// ports. Their job is to make the business rules unit-testable with no Postgres, no
// Redis, and no broker. The DecrementInventory implementation is genuinely atomic
// (mutex-guarded conditional) so the overselling test exercises the real use-case
// orchestration rather than a fake that cheats.
package memory

import (
	"context"
	"sync"
	"time"

	"github.com/ticketing-labs/backend-go/internal/domain"
)

type Store struct {
	mu           sync.Mutex
	users        map[string]*domain.User
	usersByEmail map[string]*domain.User
	events       map[string]*domain.Event
	sectors      map[string]*domain.Sector
	queue        map[string]*domain.QueueToken // key: userID|eventID
	reservations map[string]*domain.Reservation
	resByIdem    map[string]string // userID|key -> reservationID
	orders       map[string]*domain.Order
	orderByIdem  map[string]string // userID|key -> orderID
	orderByRes   map[string]string // reservationID -> orderID
	payments     map[string]*domain.Payment
	queueSeq     map[string]int
}

func NewStore() *Store {
	return &Store{
		users: map[string]*domain.User{}, usersByEmail: map[string]*domain.User{},
		events: map[string]*domain.Event{}, sectors: map[string]*domain.Sector{},
		queue: map[string]*domain.QueueToken{}, reservations: map[string]*domain.Reservation{},
		resByIdem: map[string]string{}, orders: map[string]*domain.Order{},
		orderByIdem: map[string]string{}, orderByRes: map[string]string{},
		payments: map[string]*domain.Payment{}, queueSeq: map[string]int{},
	}
}

// --- seed helpers (test convenience) ---

func (s *Store) PutUser(u *domain.User)     { s.mu.Lock(); defer s.mu.Unlock(); s.users[u.ID] = u; s.usersByEmail[u.Email] = u }
func (s *Store) PutEvent(e *domain.Event)   { s.mu.Lock(); defer s.mu.Unlock(); s.events[e.ID] = e }
func (s *Store) PutSector(x *domain.Sector) { s.mu.Lock(); defer s.mu.Unlock(); s.sectors[x.ID] = x }

func cp[T any](p *T) *T { v := *p; return &v }

// --- UserRepository ---

func (s *Store) FindByEmail(_ context.Context, email string) (*domain.User, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	if u, ok := s.usersByEmail[email]; ok { return cp(u), nil }
	return nil, domain.ErrNotFound
}
func (s *Store) FindByID(_ context.Context, id string) (*domain.User, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	if u, ok := s.users[id]; ok { return cp(u), nil }
	return nil, domain.ErrNotFound
}

// --- EventRepository ---

func (s *Store) List(_ context.Context, _ string, limit int) ([]domain.Event, string, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	out := make([]domain.Event, 0, len(s.events))
	for _, e := range s.events { out = append(out, *e) }
	if len(out) > limit { out = out[:limit] }
	return out, "", nil
}
func (s *Store) EventByID(_ context.Context, id string) (*domain.Event, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	if e, ok := s.events[id]; ok { return cp(e), nil }
	return nil, domain.ErrNotFound
}

// --- SectorRepository ---

func (s *Store) ListByEvent(_ context.Context, eventID string) ([]domain.Sector, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	var out []domain.Sector
	for _, x := range s.sectors { if x.EventID == eventID { out = append(out, *x) } }
	return out, nil
}
func (s *Store) SectorByID(_ context.Context, id string) (*domain.Sector, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	if x, ok := s.sectors[id]; ok { return cp(x), nil }
	return nil, domain.ErrNotFound
}
func (s *Store) DecrementInventory(_ context.Context, sectorID string, qty int) (bool, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	x, ok := s.sectors[sectorID]
	if !ok { return false, domain.ErrNotFound }
	if x.AvailableInventory < qty { return false, nil }
	x.AvailableInventory -= qty
	return true, nil
}
func (s *Store) IncrementInventory(_ context.Context, sectorID string, qty int) error {
	s.mu.Lock(); defer s.mu.Unlock()
	x, ok := s.sectors[sectorID]
	if !ok { return domain.ErrNotFound }
	x.AvailableInventory += qty
	return nil
}

// --- QueueRepository ---

func qkey(u, e string) string { return u + "|" + e }

func (s *Store) Upsert(_ context.Context, t *domain.QueueToken) error {
	s.mu.Lock(); defer s.mu.Unlock()
	s.queue[qkey(t.UserID, t.EventID)] = cp(t)
	return nil
}
func (s *Store) Find(_ context.Context, userID, eventID string) (*domain.QueueToken, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	if t, ok := s.queue[qkey(userID, eventID)]; ok { return cp(t), nil }
	return nil, domain.ErrNotFound
}
func (s *Store) NextPosition(_ context.Context, eventID string) (int, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	p := s.queueSeq[eventID]
	s.queueSeq[eventID] = p + 1
	return p, nil
}

// --- ReservationRepository ---

func rkey(u, k string) string { return u + "|" + k }

func (s *Store) Create(_ context.Context, r *domain.Reservation) error {
	s.mu.Lock(); defer s.mu.Unlock()
	if _, exists := s.resByIdem[rkey(r.UserID, r.IdempotencyKey)]; exists {
		return domain.ErrConflict // unique (user_id, idempotency_key) violation
	}
	s.reservations[r.ID] = cp(r)
	s.resByIdem[rkey(r.UserID, r.IdempotencyKey)] = r.ID
	return nil
}
func (s *Store) ReservationByID(_ context.Context, id string) (*domain.Reservation, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	if r, ok := s.reservations[id]; ok { return cp(r), nil }
	return nil, domain.ErrNotFound
}
func (s *Store) FindByIdempotencyKey(_ context.Context, userID, key string) (*domain.Reservation, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	if id, ok := s.resByIdem[rkey(userID, key)]; ok { return cp(s.reservations[id]), nil }
	return nil, domain.ErrNotFound
}
func (s *Store) UpdateStatus(_ context.Context, id string, status domain.ReservationStatus) error {
	s.mu.Lock(); defer s.mu.Unlock()
	r, ok := s.reservations[id]
	if !ok { return domain.ErrNotFound }
	r.Status = status
	return nil
}
func (s *Store) FindExpired(_ context.Context, now time.Time, limit int) ([]domain.Reservation, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	var out []domain.Reservation
	for _, r := range s.reservations {
		if r.Status == domain.ReservationHeld && now.After(r.ExpiresAt) {
			out = append(out, *r)
			if len(out) >= limit { break }
		}
	}
	return out, nil
}

// --- OrderRepository ---

func (s *Store) CreateOrder(_ context.Context, o *domain.Order) error {
	s.mu.Lock(); defer s.mu.Unlock()
	if _, exists := s.orderByRes[o.ReservationID]; exists { return domain.ErrConflict }
	if o.IdempotencyKey != "" {
		if _, exists := s.orderByIdem[rkey(o.UserID, o.IdempotencyKey)]; exists { return domain.ErrConflict }
	}
	s.orders[o.ID] = cp(o)
	s.orderByRes[o.ReservationID] = o.ID
	if o.IdempotencyKey != "" { s.orderByIdem[rkey(o.UserID, o.IdempotencyKey)] = o.ID }
	return nil
}
func (s *Store) OrderByID(_ context.Context, id string) (*domain.Order, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	if o, ok := s.orders[id]; ok { return cp(o), nil }
	return nil, domain.ErrNotFound
}
func (s *Store) FindByReservationID(_ context.Context, reservationID string) (*domain.Order, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	if id, ok := s.orderByRes[reservationID]; ok { return cp(s.orders[id]), nil }
	return nil, domain.ErrNotFound
}
func (s *Store) OrderByIdempotencyKey(_ context.Context, userID, key string) (*domain.Order, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	if id, ok := s.orderByIdem[rkey(userID, key)]; ok { return cp(s.orders[id]), nil }
	return nil, domain.ErrNotFound
}
func (s *Store) UpdateOrderStatus(_ context.Context, id string, status domain.OrderStatus) error {
	s.mu.Lock(); defer s.mu.Unlock()
	o, ok := s.orders[id]
	if !ok { return domain.ErrNotFound }
	o.Status = status
	return nil
}

// --- PaymentRepository ---

func (s *Store) UpsertPayment(_ context.Context, p *domain.Payment) error {
	s.mu.Lock(); defer s.mu.Unlock()
	s.payments[p.ProviderRef] = cp(p)
	return nil
}
func (s *Store) FindByOrderID(_ context.Context, orderID string) (*domain.Payment, error) {
	s.mu.Lock(); defer s.mu.Unlock()
	for _, p := range s.payments { if p.OrderID == orderID { return cp(p), nil } }
	return nil, domain.ErrNotFound
}
