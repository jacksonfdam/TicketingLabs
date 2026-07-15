"""Postgres adapter over asyncpg. The interesting method is Sectors.decrement_inventory:
a single conditional UPDATE that makes overselling impossible at the database, exactly
as in the Go backend. Only the driver and the language differ.
"""
from __future__ import annotations

import uuid
from datetime import datetime

import asyncpg

from app.domain import errors
from app.domain.models import (
    Event,
    EventStatus,
    Order,
    OrderStatus,
    Payment,
    PaymentStatus,
    QueueStatus,
    QueueToken,
    Reservation,
    ReservationStatus,
    Role,
    Sector,
    User,
)


def _valid_uuid(s: str) -> bool:
    try:
        uuid.UUID(s)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


class Users:
    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    @staticmethod
    def _row(r) -> User:
        return User(str(r["id"]), r["email"], r["password_hash"], Role(r["role"]), r["created_at"])

    async def find_by_email(self, email: str) -> User | None:
        r = await self._pool.fetchrow(
            "SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1", email
        )
        return self._row(r) if r else None

    async def find_by_id(self, user_id: str) -> User | None:
        if not _valid_uuid(user_id):
            return None
        r = await self._pool.fetchrow(
            "SELECT id, email, password_hash, role, created_at FROM users WHERE id = $1::uuid", user_id
        )
        return self._row(r) if r else None


class Events:
    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    @staticmethod
    def _row(r) -> Event:
        return Event(str(r["id"]), r["name"], r["venue"], r["starts_at"], r["sales_open_at"], EventStatus(r["status"]))

    async def list(self, cursor: str, limit: int) -> tuple[list[Event], str]:
        cols = "id, name, venue, starts_at, sales_open_at, status"
        if not cursor:
            rows = await self._pool.fetch(f"SELECT {cols} FROM events ORDER BY id LIMIT $1", limit + 1)
        else:
            # The cursor is the last seen id, so it must be a uuid. A malformed cursor
            # is a client error (400), not a reason to hand Postgres bad input.
            if not _valid_uuid(cursor):
                raise errors.BAD_REQUEST
            rows = await self._pool.fetch(
                f"SELECT {cols} FROM events WHERE id > $1::uuid ORDER BY id LIMIT $2", cursor, limit + 1
            )
        events = [self._row(r) for r in rows]
        next_cursor = ""
        if len(events) > limit:
            next_cursor = events[limit - 1].id
            events = events[:limit]
        return events, next_cursor

    async def find_by_id(self, event_id: str) -> Event | None:
        if not _valid_uuid(event_id):
            return None
        r = await self._pool.fetchrow(
            "SELECT id, name, venue, starts_at, sales_open_at, status FROM events WHERE id = $1::uuid", event_id
        )
        return self._row(r) if r else None


class Sectors:
    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    @staticmethod
    def _row(r) -> Sector:
        return Sector(
            str(r["id"]), str(r["event_id"]), r["name"], r["price_cents"], r["currency"],
            r["total_inventory"], r["available_inventory"],
        )

    async def list_by_event(self, event_id: str) -> list[Sector]:
        if not _valid_uuid(event_id):
            return []
        rows = await self._pool.fetch(
            "SELECT id, event_id, name, price_cents, currency, total_inventory, available_inventory "
            "FROM sectors WHERE event_id = $1::uuid ORDER BY name", event_id
        )
        return [self._row(r) for r in rows]

    async def find_by_id(self, sector_id: str) -> Sector | None:
        if not _valid_uuid(sector_id):
            return None
        r = await self._pool.fetchrow(
            "SELECT id, event_id, name, price_cents, currency, total_inventory, available_inventory "
            "FROM sectors WHERE id = $1::uuid", sector_id
        )
        return self._row(r) if r else None

    async def decrement_inventory(self, sector_id: str, qty: int) -> bool:
        # The anti-overselling primitive. RETURNING tells us if the row matched without
        # a separate read. No match means not enough remained.
        r = await self._pool.fetchrow(
            "UPDATE sectors SET available_inventory = available_inventory - $2 "
            "WHERE id = $1::uuid AND available_inventory >= $2 RETURNING id", sector_id, qty
        )
        return r is not None

    async def increment_inventory(self, sector_id: str, qty: int) -> None:
        await self._pool.execute(
            "UPDATE sectors SET available_inventory = available_inventory + $2 WHERE id = $1::uuid", sector_id, qty
        )


class QueueRepo:
    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    async def upsert(self, t: QueueToken) -> None:
        await self._pool.execute(
            "INSERT INTO queue_tokens (id, user_id, event_id, position, status, admitted_at) "
            "VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6) "
            "ON CONFLICT (user_id, event_id) DO UPDATE SET status = EXCLUDED.status, admitted_at = EXCLUDED.admitted_at",
            t.id, t.user_id, t.event_id, t.position, t.status.value, t.admitted_at,
        )

    async def find(self, user_id: str, event_id: str) -> QueueToken | None:
        if not (_valid_uuid(user_id) and _valid_uuid(event_id)):
            return None
        r = await self._pool.fetchrow(
            "SELECT id, user_id, event_id, position, status, admitted_at FROM queue_tokens "
            "WHERE user_id = $1::uuid AND event_id = $2::uuid", user_id, event_id
        )
        if not r:
            return None
        return QueueToken(
            str(r["id"]), str(r["user_id"]), str(r["event_id"]), r["position"],
            QueueStatus(r["status"]), r["admitted_at"],
        )

    async def next_position(self, event_id: str) -> int:
        return await self._pool.fetchval(
            "SELECT COALESCE(MAX(position)+1, 0) FROM queue_tokens WHERE event_id = $1::uuid", event_id
        )


class ReservationRepo:
    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    @staticmethod
    def _row(r) -> Reservation:
        return Reservation(
            str(r["id"]), str(r["user_id"]), str(r["sector_id"]), r["quantity"],
            ReservationStatus(r["status"]), r["expires_at"], r["idempotency_key"], r["created_at"],
        )

    _COLS = "id, user_id, sector_id, quantity, status, expires_at, idempotency_key, created_at"

    async def create(self, r: Reservation) -> None:
        try:
            await self._pool.execute(
                "INSERT INTO reservations (id, user_id, sector_id, quantity, status, expires_at, idempotency_key, created_at) "
                "VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8)",
                r.id, r.user_id, r.sector_id, r.quantity, r.status.value, r.expires_at, r.idempotency_key, r.created_at,
            )
        except asyncpg.UniqueViolationError as exc:
            raise errors.CONFLICT from exc

    async def find_by_id(self, reservation_id: str) -> Reservation | None:
        if not _valid_uuid(reservation_id):
            return None
        r = await self._pool.fetchrow(f"SELECT {self._COLS} FROM reservations WHERE id = $1::uuid", reservation_id)
        return self._row(r) if r else None

    async def find_by_idempotency_key(self, user_id: str, key: str) -> Reservation | None:
        r = await self._pool.fetchrow(
            f"SELECT {self._COLS} FROM reservations WHERE user_id = $1::uuid AND idempotency_key = $2", user_id, key
        )
        return self._row(r) if r else None

    async def update_status(self, reservation_id: str, status: str) -> None:
        await self._pool.execute("UPDATE reservations SET status = $2 WHERE id = $1::uuid", reservation_id, status)

    async def find_expired(self, now: datetime, limit: int) -> list[Reservation]:
        rows = await self._pool.fetch(
            f"SELECT {self._COLS} FROM reservations WHERE status = 'held' AND expires_at < $1 LIMIT $2", now, limit
        )
        return [self._row(r) for r in rows]


class OrderRepo:
    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    _COLS = "id, reservation_id, user_id, amount_cents, status, idempotency_key, created_at"

    @staticmethod
    def _row(r) -> Order:
        return Order(
            str(r["id"]), str(r["reservation_id"]), str(r["user_id"]), r["amount_cents"],
            OrderStatus(r["status"]), r["idempotency_key"], r["created_at"],
        )

    async def create(self, o: Order) -> None:
        try:
            await self._pool.execute(
                "INSERT INTO orders (id, reservation_id, user_id, amount_cents, status, idempotency_key, created_at) "
                "VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, now())",
                o.id, o.reservation_id, o.user_id, o.amount_cents, o.status.value, o.idempotency_key,
            )
        except asyncpg.UniqueViolationError as exc:
            raise errors.CONFLICT from exc

    async def find_by_id(self, order_id: str) -> Order | None:
        if not _valid_uuid(order_id):
            return None
        r = await self._pool.fetchrow(f"SELECT {self._COLS} FROM orders WHERE id = $1::uuid", order_id)
        return self._row(r) if r else None

    async def find_by_reservation_id(self, reservation_id: str) -> Order | None:
        r = await self._pool.fetchrow(f"SELECT {self._COLS} FROM orders WHERE reservation_id = $1::uuid", reservation_id)
        return self._row(r) if r else None

    async def find_by_idempotency_key(self, user_id: str, key: str) -> Order | None:
        r = await self._pool.fetchrow(
            f"SELECT {self._COLS} FROM orders WHERE user_id = $1::uuid AND idempotency_key = $2", user_id, key
        )
        return self._row(r) if r else None

    async def update_status(self, order_id: str, status: str) -> None:
        await self._pool.execute("UPDATE orders SET status = $2 WHERE id = $1::uuid", order_id, status)


class PaymentRepo:
    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    async def upsert(self, p: Payment) -> None:
        await self._pool.execute(
            "INSERT INTO payments (id, order_id, provider_ref, status, attempts) "
            "VALUES ($1::uuid, $2::uuid, $3, $4, $5) "
            "ON CONFLICT (provider_ref) DO UPDATE SET status = EXCLUDED.status, attempts = payments.attempts + 1",
            p.id, p.order_id, p.provider_ref, p.status.value, p.attempts,
        )

    async def find_by_order_id(self, order_id: str) -> Payment | None:
        r = await self._pool.fetchrow(
            "SELECT id, order_id, provider_ref, status, attempts FROM payments WHERE order_id = $1::uuid LIMIT 1", order_id
        )
        if not r:
            return None
        return Payment(str(r["id"]), str(r["order_id"]), r["provider_ref"], PaymentStatus(r["status"]), r["attempts"])
