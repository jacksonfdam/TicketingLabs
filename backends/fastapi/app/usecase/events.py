from __future__ import annotations

from dataclasses import dataclass

from app.domain import errors
from app.domain.models import Event, Sector
from app.usecase.ports import EventRepository, SectorRepository


@dataclass
class EventDetail:
    event: Event
    sectors: list[Sector]


class EventService:
    def __init__(self, events: EventRepository, sectors: SectorRepository):
        self._events = events
        self._sectors = sectors

    async def list(self, cursor: str, limit: int) -> tuple[list[Event], str]:
        if limit <= 0 or limit > 100:
            limit = 20
        return await self._events.list(cursor, limit)

    async def get(self, event_id: str) -> EventDetail:
        event = await self._events.find_by_id(event_id)
        if event is None:
            raise errors.NOT_FOUND
        sectors = await self._sectors.list_by_event(event_id)
        return EventDetail(event=event, sectors=sectors)
