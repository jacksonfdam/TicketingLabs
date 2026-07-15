package usecase

import (
	"context"

	"github.com/ticketing-labs/backend-go/internal/domain"
)

type EventDetail struct {
	Event   domain.Event
	Sectors []domain.Sector
}

type EventService struct {
	events  EventRepository
	sectors SectorRepository
}

func NewEventService(e EventRepository, s SectorRepository) *EventService {
	return &EventService{events: e, sectors: s}
}

// List returns a page of events and an opaque next cursor. An empty next cursor
// means the caller has reached the end.
func (s *EventService) List(ctx context.Context, cursor string, limit int) ([]domain.Event, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	return s.events.List(ctx, cursor, limit)
}

func (s *EventService) Get(ctx context.Context, id string) (*EventDetail, error) {
	event, err := s.events.FindByID(ctx, id)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	sectors, err := s.sectors.ListByEvent(ctx, id)
	if err != nil {
		return nil, domain.ErrInternal
	}
	return &EventDetail{Event: *event, Sectors: sectors}, nil
}
