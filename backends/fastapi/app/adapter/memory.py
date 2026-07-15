"""In-process, async implementations of the ports for unit testing. The decrement is
atomic within the event loop (no await mid-operation), and the locker serialises per
key, so the reservation tests exercise the real use-case orchestration.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from app.domain import errors
from app.domain.models import (
    Event,
    Order,
    Payment,
    QueueToken,
    Reservation,
    Sector,
    User,
)


class Store:
    def __init__(self) -> None:
        self.users: dict[str, User] = {}
        self.users_by_email: dict[str, User] = {}
        self.events: dict[str, Event] = {}
        self.sectors: dict[str, Sector] = {}
        self.queue: dict[tuple[str, str], QueueToken] = {}
        self.queue_seq: dict[str, int] = {}
        self.reservations: dict[str, Reservation] = {}
        self.res_by_idem: dict[tuple[str, str], str] = {}
        self.orders: dict[str, Order] = {}
        self.order_by_idem: dict[tuple[str, str], str] = {}
        self.order_by_res: dict[str, str] = {}
        self.payments: dict[str, Payment] = {}

    def put_user(self, u: User) -> None:
        self.users[u.id] = u
        self.users_by_email[u.email] = u

    def put_event(self, e: Event) -> None:
        self.events[e.id] = e

    def put_sector(self, s: Sector) -> None:
        self.sectors[s.id] = s

    # UserRepository
    async def find_by_email(self, email: str) -> User | None:
        return self.users_by_email.get(email)

    async def find_by_id(self, user_id: str) -> User | None:
        return self.users.get(user_id)

    # EventRepository
    async def list(self, cursor: str, limit: int) -> tuple[list[Event], str]:
        items = list(self.events.values())[:limit]
        return items, ""

    async def event_by_id(self, event_id: str) -> Event | None:
        return self.events.get(event_id)

    # SectorRepository
    async def list_by_event(self, event_id: str) -> list[Sector]:
        return [s for s in self.sectors.values() if s.event_id == event_id]

    async def sector_by_id(self, sector_id: str) -> Sector | None:
        return self.sectors.get(sector_id)

    async def decrement_inventory(self, sector_id: str, qty: int) -> bool:
        s = self.sectors.get(sector_id)
        if s is None or s.available_inventory < qty:
            return False
        s.available_inventory -= qty
        return True

    async def increment_inventory(self, sector_id: str, qty: int) -> None:
        s = self.sectors.get(sector_id)
        if s is not None:
            s.available_inventory += qty

    # QueueRepository
    async def upsert(self, token: QueueToken) -> None:
        self.queue[(token.user_id, token.event_id)] = token

    async def find(self, user_id: str, event_id: str) -> QueueToken | None:
        return self.queue.get((user_id, event_id))

    async def next_position(self, event_id: str) -> int:
        p = self.queue_seq.get(event_id, 0)
        self.queue_seq[event_id] = p + 1
        return p

    # ReservationRepository
    async def create(self, r: Reservation) -> None:
        key = (r.user_id, r.idempotency_key)
        if key in self.res_by_idem:
            raise errors.CONFLICT
        self.reservations[r.id] = r
        self.res_by_idem[key] = r.id

    async def reservation_by_id(self, reservation_id: str) -> Reservation | None:
        return self.reservations.get(reservation_id)

    async def find_by_idempotency_key(self, user_id: str, key: str) -> Reservation | None:
        rid = self.res_by_idem.get((user_id, key))
        return self.reservations.get(rid) if rid else None

    async def update_status(self, reservation_id: str, status: str) -> None:
        r = self.reservations.get(reservation_id)
        if r is not None:
            from app.domain.models import ReservationStatus

            r.status = ReservationStatus(status)

    async def find_expired(self, now: datetime, limit: int) -> list[Reservation]:
        from app.domain.models import ReservationStatus

        out = [
            r
            for r in self.reservations.values()
            if r.status == ReservationStatus.HELD and now > r.expires_at
        ]
        return out[:limit]


# Thin per-aggregate views. The ports reuse method names (find_by_id, create) across
# aggregates, so each gets its own adapter that maps port names onto the store.


class Users:
    def __init__(self, s: Store):
        self.s = s

    async def find_by_email(self, email: str) -> User | None:
        return await self.s.find_by_email(email)

    async def find_by_id(self, user_id: str) -> User | None:
        return await self.s.find_by_id(user_id)


class Events:
    def __init__(self, s: Store):
        self.s = s

    async def list(self, cursor: str, limit: int) -> tuple[list[Event], str]:
        return await self.s.list(cursor, limit)

    async def find_by_id(self, event_id: str) -> Event | None:
        return await self.s.event_by_id(event_id)


class Sectors:
    def __init__(self, s: Store):
        self.s = s

    async def list_by_event(self, event_id: str) -> list[Sector]:
        return await self.s.list_by_event(event_id)

    async def find_by_id(self, sector_id: str) -> Sector | None:
        return await self.s.sector_by_id(sector_id)

    async def decrement_inventory(self, sector_id: str, qty: int) -> bool:
        return await self.s.decrement_inventory(sector_id, qty)

    async def increment_inventory(self, sector_id: str, qty: int) -> None:
        await self.s.increment_inventory(sector_id, qty)


class Queue:
    def __init__(self, s: Store):
        self.s = s

    async def upsert(self, token: QueueToken) -> None:
        await self.s.upsert(token)

    async def find(self, user_id: str, event_id: str) -> QueueToken | None:
        return await self.s.find(user_id, event_id)

    async def next_position(self, event_id: str) -> int:
        return await self.s.next_position(event_id)


class Reservations:
    def __init__(self, s: Store):
        self.s = s

    async def create(self, r: Reservation) -> None:
        await self.s.create(r)

    async def find_by_id(self, reservation_id: str) -> Reservation | None:
        return await self.s.reservation_by_id(reservation_id)

    async def find_by_idempotency_key(self, user_id: str, key: str) -> Reservation | None:
        return await self.s.find_by_idempotency_key(user_id, key)

    async def update_status(self, reservation_id: str, status: str) -> None:
        await self.s.update_status(reservation_id, status)

    async def find_expired(self, now: datetime, limit: int) -> list[Reservation]:
        return await self.s.find_expired(now, limit)


class AllowAllRateLimiter:
    async def allow(self, key: str, limit: int, window: timedelta) -> bool:
        return True


class Locker:
    """Per-key asyncio lock. acquire returns a handle whose release() frees it."""

    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {}

    async def acquire(self, key: str, wait: timedelta):
        lock = self._locks.setdefault(key, asyncio.Lock())
        try:
            await asyncio.wait_for(lock.acquire(), timeout=wait.total_seconds())
        except asyncio.TimeoutError:
            return None
        return _Handle(lock)


class _Handle:
    def __init__(self, lock: asyncio.Lock) -> None:
        self._lock = lock

    async def release(self) -> None:
        self._lock.release()
