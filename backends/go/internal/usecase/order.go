package usecase

import (
	"context"
	"encoding/json"

	"github.com/ticketing-labs/backend-go/internal/domain"
)

// TopicPaymentRequested is the broker topic a new order publishes to. The payment
// worker consumes it and calls the external gateway. This is what makes payment
// asynchronous and lets POST /orders return 202 immediately.
const TopicPaymentRequested = "payment.requested"

// PaymentRequested is the message body on TopicPaymentRequested.
type PaymentRequested struct {
	OrderID string `json:"order_id"`
}

type OrderService struct {
	orders       OrderRepository
	reservations ReservationRepository
	sectors      SectorRepository
	publisher    Publisher
	ids          IDGenerator
}

func NewOrderService(o OrderRepository, r ReservationRepository, sec SectorRepository, p Publisher, ids IDGenerator) *OrderService {
	return &OrderService{orders: o, reservations: r, sectors: sec, publisher: p, ids: ids}
}

// Create turns a held reservation into a pending order and enqueues payment. It does
// not wait for the payment; the caller polls GET /orders/{id}. Idempotent by key.
func (s *OrderService) Create(ctx context.Context, userID, reservationID, idemKey string) (*domain.Order, error) {
	if idemKey == "" {
		return nil, domain.ErrValidation
	}
	if prior, err := s.orders.FindByIdempotencyKey(ctx, userID, idemKey); err == nil && prior != nil {
		return prior, nil
	}

	res, err := s.reservations.FindByID(ctx, reservationID)
	if err != nil || res == nil {
		return nil, domain.ErrNotFound
	}
	if res.UserID != userID {
		return nil, domain.ErrNotFound
	}
	if res.Status != domain.ReservationHeld {
		return nil, domain.ErrReservationState
	}
	// One order per reservation.
	if existing, err := s.orders.FindByReservationID(ctx, reservationID); err == nil && existing != nil {
		return existing, nil
	}

	sector, err := s.sectors.FindByID(ctx, res.SectorID)
	if err != nil {
		return nil, domain.ErrInternal
	}

	order := &domain.Order{
		ID:             s.ids.NewID(),
		ReservationID:  reservationID,
		UserID:         userID,
		AmountCents:    sector.PriceCents * int64(res.Quantity),
		Status:         domain.OrderPending,
		IdempotencyKey: idemKey,
	}
	if err := s.orders.Create(ctx, order); err != nil {
		if prior, ferr := s.orders.FindByIdempotencyKey(ctx, userID, idemKey); ferr == nil && prior != nil {
			return prior, nil
		}
		return nil, domain.ErrInternal
	}

	payload, _ := json.Marshal(PaymentRequested{OrderID: order.ID})
	if err := s.publisher.Publish(ctx, TopicPaymentRequested, payload); err != nil {
		// The order exists and is pending; a failed publish is recoverable by a
		// reconciliation sweep. We do not fail the request over it.
		return order, nil
	}
	return order, nil
}

func (s *OrderService) Get(ctx context.Context, id string) (*domain.Order, error) {
	o, err := s.orders.FindByID(ctx, id)
	if err != nil || o == nil {
		return nil, domain.ErrNotFound
	}
	return o, nil
}
