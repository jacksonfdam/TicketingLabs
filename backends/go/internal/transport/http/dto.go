package http

import (
	"time"

	"github.com/ticketing-labs/backend-go/internal/domain"
	"github.com/ticketing-labs/backend-go/internal/usecase"
)

// These DTOs are the wire shape defined by contract/openapi.yaml: snake_case fields,
// RFC3339 timestamps. They are deliberately separate from the domain structs so the
// public contract and the internal model can evolve independently.

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token"`
}

type tokenPairDTO struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

func toTokenPair(p *usecase.TokenPair) tokenPairDTO {
	return tokenPairDTO{AccessToken: p.AccessToken, RefreshToken: p.RefreshToken, TokenType: "Bearer", ExpiresIn: p.ExpiresIn}
}

type eventDTO struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Venue       string `json:"venue"`
	StartsAt    string `json:"starts_at"`
	SalesOpenAt string `json:"sales_open_at"`
	Status      string `json:"status"`
}

func toEvent(e domain.Event) eventDTO {
	return eventDTO{
		ID: e.ID, Name: e.Name, Venue: e.Venue,
		StartsAt: e.StartsAt.Format(time.RFC3339), SalesOpenAt: e.SalesOpenAt.Format(time.RFC3339),
		Status: string(e.Status),
	}
}

type sectorDTO struct {
	ID                 string `json:"id"`
	EventID            string `json:"event_id"`
	Name               string `json:"name"`
	PriceCents         int64  `json:"price_cents"`
	Currency           string `json:"currency"`
	TotalInventory     int    `json:"total_inventory"`
	AvailableInventory int    `json:"available_inventory"`
}

func toSector(s domain.Sector) sectorDTO {
	return sectorDTO{
		ID: s.ID, EventID: s.EventID, Name: s.Name, PriceCents: s.PriceCents,
		Currency: s.Currency, TotalInventory: s.TotalInventory, AvailableInventory: s.AvailableInventory,
	}
}

// eventDetailDTO flattens Event and adds sectors, matching the allOf in the contract.
type eventDetailDTO struct {
	eventDTO
	Sectors []sectorDTO `json:"sectors"`
}

type eventPageDTO struct {
	Data       []eventDTO `json:"data"`
	NextCursor *string    `json:"next_cursor"`
}

type queueTokenDTO struct {
	ID         string  `json:"id"`
	UserID     string  `json:"user_id"`
	EventID    string  `json:"event_id"`
	Position   int     `json:"position"`
	Status     string  `json:"status"`
	AdmittedAt *string `json:"admitted_at"`
}

func toQueueToken(t *domain.QueueToken) queueTokenDTO {
	dto := queueTokenDTO{ID: t.ID, UserID: t.UserID, EventID: t.EventID, Position: t.Position, Status: string(t.Status)}
	if t.AdmittedAt != nil {
		s := t.AdmittedAt.Format(time.RFC3339)
		dto.AdmittedAt = &s
	}
	return dto
}

type createReservationReq struct {
	SectorID string `json:"sector_id"`
	Quantity int    `json:"quantity"`
}

type reservationDTO struct {
	ID        string `json:"id"`
	UserID    string `json:"user_id"`
	SectorID  string `json:"sector_id"`
	Quantity  int    `json:"quantity"`
	Status    string `json:"status"`
	ExpiresAt string `json:"expires_at"`
}

func toReservation(r *domain.Reservation) reservationDTO {
	return reservationDTO{
		ID: r.ID, UserID: r.UserID, SectorID: r.SectorID, Quantity: r.Quantity,
		Status: string(r.Status), ExpiresAt: r.ExpiresAt.Format(time.RFC3339),
	}
}

type createOrderReq struct {
	ReservationID string `json:"reservation_id"`
}

type orderDTO struct {
	ID            string `json:"id"`
	ReservationID string `json:"reservation_id"`
	UserID        string `json:"user_id"`
	AmountCents   int64  `json:"amount_cents"`
	Status        string `json:"status"`
	CreatedAt     string `json:"created_at"`
}

func toOrder(o *domain.Order) orderDTO {
	return orderDTO{
		ID: o.ID, ReservationID: o.ReservationID, UserID: o.UserID, AmountCents: o.AmountCents,
		Status: string(o.Status), CreatedAt: o.CreatedAt.Format(time.RFC3339),
	}
}

type webhookReq struct {
	ProviderRef string `json:"provider_ref"`
	OrderID     string `json:"order_id"`
	Status      string `json:"status"`
}

type healthDTO struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks,omitempty"`
}
