package memory

import (
	"context"
	"time"

	"github.com/ticketing-labs/backend-go/internal/domain"
	"github.com/ticketing-labs/backend-go/internal/usecase"
)

// These wrapper types adapt the single Store to the individual port interfaces. The
// ports deliberately reuse names (FindByID, Create, Upsert) across aggregates, which
// one Go type cannot satisfy at once, so each aggregate gets a thin typed view.

type Users struct{ S *Store }

func (r Users) FindByEmail(ctx context.Context, email string) (*domain.User, error) { return r.S.FindByEmail(ctx, email) }
func (r Users) FindByID(ctx context.Context, id string) (*domain.User, error)        { return r.S.FindByID(ctx, id) }

type Events struct{ S *Store }

func (r Events) List(ctx context.Context, cursor string, limit int) ([]domain.Event, string, error) { return r.S.List(ctx, cursor, limit) }
func (r Events) FindByID(ctx context.Context, id string) (*domain.Event, error)                     { return r.S.EventByID(ctx, id) }

type Sectors struct{ S *Store }

func (r Sectors) ListByEvent(ctx context.Context, eventID string) ([]domain.Sector, error) { return r.S.ListByEvent(ctx, eventID) }
func (r Sectors) FindByID(ctx context.Context, id string) (*domain.Sector, error)          { return r.S.SectorByID(ctx, id) }
func (r Sectors) DecrementInventory(ctx context.Context, sectorID string, qty int) (bool, error) { return r.S.DecrementInventory(ctx, sectorID, qty) }
func (r Sectors) IncrementInventory(ctx context.Context, sectorID string, qty int) error         { return r.S.IncrementInventory(ctx, sectorID, qty) }

type Queue struct{ S *Store }

func (r Queue) Upsert(ctx context.Context, t *domain.QueueToken) error                       { return r.S.Upsert(ctx, t) }
func (r Queue) Find(ctx context.Context, userID, eventID string) (*domain.QueueToken, error) { return r.S.Find(ctx, userID, eventID) }
func (r Queue) NextPosition(ctx context.Context, eventID string) (int, error)                { return r.S.NextPosition(ctx, eventID) }

type Reservations struct{ S *Store }

func (r Reservations) Create(ctx context.Context, res *domain.Reservation) error                 { return r.S.Create(ctx, res) }
func (r Reservations) FindByID(ctx context.Context, id string) (*domain.Reservation, error)      { return r.S.ReservationByID(ctx, id) }
func (r Reservations) FindByIdempotencyKey(ctx context.Context, userID, key string) (*domain.Reservation, error) { return r.S.FindByIdempotencyKey(ctx, userID, key) }
func (r Reservations) UpdateStatus(ctx context.Context, id string, status domain.ReservationStatus) error        { return r.S.UpdateStatus(ctx, id, status) }
func (r Reservations) FindExpired(ctx context.Context, now time.Time, limit int) ([]domain.Reservation, error)   { return r.S.FindExpired(ctx, now, limit) }

type Orders struct{ S *Store }

func (r Orders) Create(ctx context.Context, o *domain.Order) error                                       { return r.S.CreateOrder(ctx, o) }
func (r Orders) FindByID(ctx context.Context, id string) (*domain.Order, error)                          { return r.S.OrderByID(ctx, id) }
func (r Orders) FindByReservationID(ctx context.Context, reservationID string) (*domain.Order, error)    { return r.S.FindByReservationID(ctx, reservationID) }
func (r Orders) FindByIdempotencyKey(ctx context.Context, userID, key string) (*domain.Order, error)     { return r.S.OrderByIdempotencyKey(ctx, userID, key) }
func (r Orders) UpdateStatus(ctx context.Context, id string, status domain.OrderStatus) error            { return r.S.UpdateOrderStatus(ctx, id, status) }

type Payments struct{ S *Store }

func (r Payments) Upsert(ctx context.Context, p *domain.Payment) error                     { return r.S.UpsertPayment(ctx, p) }
func (r Payments) FindByOrderID(ctx context.Context, orderID string) (*domain.Payment, error) { return r.S.FindByOrderID(ctx, orderID) }

// Compile-time proof the wrappers satisfy the ports.
var (
	_ usecase.UserRepository        = Users{}
	_ usecase.EventRepository       = Events{}
	_ usecase.SectorRepository      = Sectors{}
	_ usecase.QueueRepository       = Queue{}
	_ usecase.ReservationRepository = Reservations{}
	_ usecase.OrderRepository       = Orders{}
	_ usecase.PaymentRepository     = Payments{}
)
