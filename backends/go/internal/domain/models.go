// Package domain holds the entities, enums, and invariants of the ticketing model.
// It imports nothing from the web framework, the database driver, or any adapter.
// If this package ever imports chi, pgx, or redis, the architecture has sprung a
// leak and the whole comparison stops being fair. See docs/adr/0003.
package domain

import "time"

type Role string

const (
	RoleCustomer Role = "customer"
	RoleAdmin    Role = "admin"
)

type EventStatus string

const (
	EventDraft   EventStatus = "draft"
	EventOnSale  EventStatus = "on_sale"
	EventSoldOut EventStatus = "sold_out"
	EventClosed  EventStatus = "closed"
)

type QueueStatus string

const (
	QueueWaiting  QueueStatus = "waiting"
	QueueAdmitted QueueStatus = "admitted"
	QueueExpired  QueueStatus = "expired"
)

type ReservationStatus string

const (
	ReservationHeld      ReservationStatus = "held"
	ReservationConfirmed ReservationStatus = "confirmed"
	ReservationReleased  ReservationStatus = "released"
	ReservationExpired   ReservationStatus = "expired"
)

type OrderStatus string

const (
	OrderPending  OrderStatus = "pending"
	OrderPaid     OrderStatus = "paid"
	OrderFailed   OrderStatus = "failed"
	OrderRefunded OrderStatus = "refunded"
)

type PaymentStatus string

const (
	PaymentPending   PaymentStatus = "pending"
	PaymentSucceeded PaymentStatus = "succeeded"
	PaymentFailed    PaymentStatus = "failed"
)

type User struct {
	ID           string
	Email        string
	PasswordHash string
	Role         Role
	CreatedAt    time.Time
}

type Event struct {
	ID          string
	Name        string
	Venue       string
	StartsAt    time.Time
	SalesOpenAt time.Time
	Status      EventStatus
}

type Sector struct {
	ID                 string
	EventID            string
	Name               string
	PriceCents         int64
	Currency           string
	TotalInventory     int
	AvailableInventory int
}

type QueueToken struct {
	ID         string
	UserID     string
	EventID    string
	Position   int
	Status     QueueStatus
	AdmittedAt *time.Time
}

type Reservation struct {
	ID             string
	UserID         string
	SectorID       string
	Quantity       int
	Status         ReservationStatus
	ExpiresAt      time.Time
	IdempotencyKey string
	CreatedAt      time.Time
}

type Order struct {
	ID             string
	ReservationID  string
	UserID         string
	AmountCents    int64
	Status         OrderStatus
	IdempotencyKey string
	CreatedAt      time.Time
}

type Payment struct {
	ID          string
	OrderID     string
	ProviderRef string
	Status      PaymentStatus
	Attempts    int
}
