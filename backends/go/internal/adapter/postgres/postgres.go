// Package postgres implements the persistence ports over pgx. The interesting method
// is Sectors.DecrementInventory: a single conditional UPDATE that makes overselling
// impossible at the database, no matter what the application layer gets wrong.
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel"

	"github.com/ticketing-labs/backend-go/internal/domain"
)

const uniqueViolation = "23505"

func isUnique(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == uniqueViolation
}

// --- Users ---

type UserRepo struct{ Pool *pgxpool.Pool }

func (r UserRepo) scan(row pgx.Row) (*domain.User, error) {
	var u domain.User
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (r UserRepo) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	return r.scan(r.Pool.QueryRow(ctx,
		`SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1`, email))
}

func (r UserRepo) FindByID(ctx context.Context, id string) (*domain.User, error) {
	return r.scan(r.Pool.QueryRow(ctx,
		`SELECT id, email, password_hash, role, created_at FROM users WHERE id = $1`, id))
}

// --- Events ---

type EventRepo struct{ Pool *pgxpool.Pool }

// List paginates by cursor (the last seen id). Ordering by id is stable, which is what
// cursor pagination needs; offset pagination would drift as rows are inserted.
func (r EventRepo) List(ctx context.Context, cursor string, limit int) ([]domain.Event, string, error) {
	// Branch on the cursor rather than a single query with an OR: the id column is a
	// uuid, and comparing it against an empty text placeholder is a type error. When a
	// cursor is present it is cast to uuid explicitly.
	const cols = `id, name, venue, starts_at, sales_open_at, status`
	var (
		rows pgx.Rows
		err  error
	)
	if cursor == "" {
		rows, err = r.Pool.Query(ctx,
			`SELECT `+cols+` FROM events ORDER BY id LIMIT $1`, limit+1)
	} else {
		// The cursor is the last seen id, so it must be a uuid. A malformed cursor is a
		// client error (400), not a reason to hand Postgres bad input and return 500.
		if _, perr := uuid.Parse(cursor); perr != nil {
			return nil, "", domain.ErrBadRequest
		}
		rows, err = r.Pool.Query(ctx,
			`SELECT `+cols+` FROM events WHERE id > $1::uuid ORDER BY id LIMIT $2`, cursor, limit+1)
	}
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var out []domain.Event
	for rows.Next() {
		var e domain.Event
		if err := rows.Scan(&e.ID, &e.Name, &e.Venue, &e.StartsAt, &e.SalesOpenAt, &e.Status); err != nil {
			return nil, "", err
		}
		out = append(out, e)
	}
	next := ""
	if len(out) > limit {
		next = out[limit-1].ID
		out = out[:limit]
	}
	return out, next, rows.Err()
}

func (r EventRepo) FindByID(ctx context.Context, id string) (*domain.Event, error) {
	var e domain.Event
	err := r.Pool.QueryRow(ctx,
		`SELECT id, name, venue, starts_at, sales_open_at, status FROM events WHERE id = $1`, id).
		Scan(&e.ID, &e.Name, &e.Venue, &e.StartsAt, &e.SalesOpenAt, &e.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &e, err
}

// --- Sectors ---

type SectorRepo struct{ Pool *pgxpool.Pool }

func (r SectorRepo) ListByEvent(ctx context.Context, eventID string) ([]domain.Sector, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT id, event_id, name, price_cents, currency, total_inventory, available_inventory
		   FROM sectors WHERE event_id = $1 ORDER BY name`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Sector
	for rows.Next() {
		var s domain.Sector
		if err := rows.Scan(&s.ID, &s.EventID, &s.Name, &s.PriceCents, &s.Currency, &s.TotalInventory, &s.AvailableInventory); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r SectorRepo) FindByID(ctx context.Context, id string) (*domain.Sector, error) {
	var s domain.Sector
	err := r.Pool.QueryRow(ctx,
		`SELECT id, event_id, name, price_cents, currency, total_inventory, available_inventory
		   FROM sectors WHERE id = $1`, id).
		Scan(&s.ID, &s.EventID, &s.Name, &s.PriceCents, &s.Currency, &s.TotalInventory, &s.AvailableInventory)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &s, err
}

// DecrementInventory is the anti-overselling primitive. The WHERE clause refuses the
// update when too little remains, so RowsAffected tells us success without a read.
func (r SectorRepo) DecrementInventory(ctx context.Context, sectorID string, qty int) (bool, error) {
	ctx, span := otel.Tracer("postgres").Start(ctx, "db.decrement_inventory")
	defer span.End()
	tag, err := r.Pool.Exec(ctx,
		`UPDATE sectors SET available_inventory = available_inventory - $2
		  WHERE id = $1 AND available_inventory >= $2`, sectorID, qty)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func (r SectorRepo) IncrementInventory(ctx context.Context, sectorID string, qty int) error {
	_, err := r.Pool.Exec(ctx,
		`UPDATE sectors SET available_inventory = available_inventory + $2 WHERE id = $1`, sectorID, qty)
	return err
}

// --- Queue ---

type QueueRepo struct{ Pool *pgxpool.Pool }

func (r QueueRepo) Upsert(ctx context.Context, t *domain.QueueToken) error {
	_, err := r.Pool.Exec(ctx,
		`INSERT INTO queue_tokens (id, user_id, event_id, position, status, admitted_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (user_id, event_id)
		 DO UPDATE SET status = EXCLUDED.status, admitted_at = EXCLUDED.admitted_at`,
		t.ID, t.UserID, t.EventID, t.Position, t.Status, t.AdmittedAt)
	return err
}

func (r QueueRepo) Find(ctx context.Context, userID, eventID string) (*domain.QueueToken, error) {
	var t domain.QueueToken
	err := r.Pool.QueryRow(ctx,
		`SELECT id, user_id, event_id, position, status, admitted_at
		   FROM queue_tokens WHERE user_id = $1 AND event_id = $2`, userID, eventID).
		Scan(&t.ID, &t.UserID, &t.EventID, &t.Position, &t.Status, &t.AdmittedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &t, err
}

func (r QueueRepo) NextPosition(ctx context.Context, eventID string) (int, error) {
	var pos int
	err := r.Pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(position)+1, 0) FROM queue_tokens WHERE event_id = $1`, eventID).Scan(&pos)
	return pos, err
}

// --- Reservations ---

type ReservationRepo struct{ Pool *pgxpool.Pool }

func (r ReservationRepo) Create(ctx context.Context, res *domain.Reservation) error {
	_, err := r.Pool.Exec(ctx,
		`INSERT INTO reservations (id, user_id, sector_id, quantity, status, expires_at, idempotency_key, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		res.ID, res.UserID, res.SectorID, res.Quantity, res.Status, res.ExpiresAt, res.IdempotencyKey, res.CreatedAt)
	if isUnique(err) {
		return domain.ErrConflict
	}
	return err
}

func (r ReservationRepo) scanOne(row pgx.Row) (*domain.Reservation, error) {
	var res domain.Reservation
	err := row.Scan(&res.ID, &res.UserID, &res.SectorID, &res.Quantity, &res.Status, &res.ExpiresAt, &res.IdempotencyKey, &res.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &res, err
}

func (r ReservationRepo) FindByID(ctx context.Context, id string) (*domain.Reservation, error) {
	return r.scanOne(r.Pool.QueryRow(ctx,
		`SELECT id, user_id, sector_id, quantity, status, expires_at, idempotency_key, created_at
		   FROM reservations WHERE id = $1`, id))
}

func (r ReservationRepo) FindByIdempotencyKey(ctx context.Context, userID, key string) (*domain.Reservation, error) {
	return r.scanOne(r.Pool.QueryRow(ctx,
		`SELECT id, user_id, sector_id, quantity, status, expires_at, idempotency_key, created_at
		   FROM reservations WHERE user_id = $1 AND idempotency_key = $2`, userID, key))
}

func (r ReservationRepo) UpdateStatus(ctx context.Context, id string, status domain.ReservationStatus) error {
	_, err := r.Pool.Exec(ctx, `UPDATE reservations SET status = $2 WHERE id = $1`, id, status)
	return err
}

func (r ReservationRepo) FindExpired(ctx context.Context, now time.Time, limit int) ([]domain.Reservation, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT id, user_id, sector_id, quantity, status, expires_at, idempotency_key, created_at
		   FROM reservations WHERE status = 'held' AND expires_at < $1 LIMIT $2`, now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Reservation
	for rows.Next() {
		var res domain.Reservation
		if err := rows.Scan(&res.ID, &res.UserID, &res.SectorID, &res.Quantity, &res.Status, &res.ExpiresAt, &res.IdempotencyKey, &res.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, res)
	}
	return out, rows.Err()
}

// --- Orders ---

type OrderRepo struct{ Pool *pgxpool.Pool }

func (r OrderRepo) Create(ctx context.Context, o *domain.Order) error {
	_, err := r.Pool.Exec(ctx,
		`INSERT INTO orders (id, reservation_id, user_id, amount_cents, status, idempotency_key, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, now())`,
		o.ID, o.ReservationID, o.UserID, o.AmountCents, o.Status, nullIfEmpty(o.IdempotencyKey))
	if isUnique(err) {
		return domain.ErrConflict
	}
	return err
}

func (r OrderRepo) scanOne(row pgx.Row) (*domain.Order, error) {
	var o domain.Order
	var idem *string
	err := row.Scan(&o.ID, &o.ReservationID, &o.UserID, &o.AmountCents, &o.Status, &idem, &o.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if idem != nil {
		o.IdempotencyKey = *idem
	}
	return &o, err
}

const orderCols = `id, reservation_id, user_id, amount_cents, status, idempotency_key, created_at`

func (r OrderRepo) FindByID(ctx context.Context, id string) (*domain.Order, error) {
	return r.scanOne(r.Pool.QueryRow(ctx, `SELECT `+orderCols+` FROM orders WHERE id = $1`, id))
}

func (r OrderRepo) FindByReservationID(ctx context.Context, reservationID string) (*domain.Order, error) {
	return r.scanOne(r.Pool.QueryRow(ctx, `SELECT `+orderCols+` FROM orders WHERE reservation_id = $1`, reservationID))
}

func (r OrderRepo) FindByIdempotencyKey(ctx context.Context, userID, key string) (*domain.Order, error) {
	return r.scanOne(r.Pool.QueryRow(ctx, `SELECT `+orderCols+` FROM orders WHERE user_id = $1 AND idempotency_key = $2`, userID, key))
}

func (r OrderRepo) UpdateStatus(ctx context.Context, id string, status domain.OrderStatus) error {
	_, err := r.Pool.Exec(ctx, `UPDATE orders SET status = $2 WHERE id = $1`, id, status)
	return err
}

// --- Payments ---

type PaymentRepo struct{ Pool *pgxpool.Pool }

func (r PaymentRepo) Upsert(ctx context.Context, p *domain.Payment) error {
	_, err := r.Pool.Exec(ctx,
		`INSERT INTO payments (id, order_id, provider_ref, status, attempts)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (provider_ref)
		 DO UPDATE SET status = EXCLUDED.status, attempts = payments.attempts + 1`,
		p.ID, p.OrderID, p.ProviderRef, p.Status, p.Attempts)
	return err
}

func (r PaymentRepo) FindByOrderID(ctx context.Context, orderID string) (*domain.Payment, error) {
	var p domain.Payment
	err := r.Pool.QueryRow(ctx,
		`SELECT id, order_id, provider_ref, status, attempts FROM payments WHERE order_id = $1 LIMIT 1`, orderID).
		Scan(&p.ID, &p.OrderID, &p.ProviderRef, &p.Status, &p.Attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &p, err
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
