"""Unit tests for the reservation use case. No Postgres, no Redis, no event loop
tricks beyond asyncio.gather. These mirror the Go backend's tests, because the same
invariants must hold in both.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.adapter import memory
from app.domain import errors
from app.domain.models import Event, EventStatus, Sector
from app.usecase.reservation import ReservationService

pytestmark = pytest.mark.asyncio


class FixedClock:
    def __init__(self, t: datetime):
        self.t = t

    def now(self) -> datetime:
        return self.t


class SeqIDs:
    def __init__(self):
        self.n = 0

    def new_id(self) -> str:
        self.n += 1
        return f"id-{self.n}"


class AlwaysAdmit:
    async def is_admitted(self, user_id: str, event_id: str) -> bool:
        return True


class NeverAdmit:
    async def is_admitted(self, user_id: str, event_id: str) -> bool:
        return False


def make_fixture(available: int, admission=None):
    store = memory.Store()
    store.put_event(Event("evt", "n", "v", datetime.now(timezone.utc), datetime.now(timezone.utc), EventStatus.ON_SALE))
    store.put_sector(Sector("sec", "evt", "Pista", 100, "BRL", available, available))
    svc = ReservationService(
        memory.Reservations(store),
        memory.Sectors(store),
        memory.Locker(),
        admission or AlwaysAdmit(),
        FixedClock(datetime(2026, 1, 1, tzinfo=timezone.utc)),
        SeqIDs(),
        timedelta(minutes=1),
    )
    return store, svc


async def test_no_overselling_under_concurrency():
    available, buyers = 100, 500
    store, svc = make_fixture(available)

    async def buy(i: int):
        try:
            await svc.create(f"user-{i}", "sec", 1, f"key-{i}")
            return "ok"
        except errors.DomainError as e:
            return e.code

    results = await asyncio.gather(*(buy(i) for i in range(buyers)))
    success = results.count("ok")
    exhausted = results.count(errors.INVENTORY_EXHAUSTED.code)

    assert success == available, f"expected {available} successes, got {success}"
    assert exhausted == buyers - available
    assert store.sectors["sec"].available_inventory == 0


async def test_idempotent_replay():
    store, svc = make_fixture(50)

    async def attempt():
        res = await svc.create("same-user", "sec", 2, "same-key")
        return res.reservation.id

    ids = await asyncio.gather(*(attempt() for _ in range(40)))
    assert len(set(ids)) == 1, "idempotency broke: multiple reservations created"
    assert store.sectors["sec"].available_inventory == 48


async def test_requires_admission():
    _, svc = make_fixture(10, admission=NeverAdmit())
    with pytest.raises(errors.DomainError) as exc:
        await svc.create("user", "sec", 1, "k")
    assert exc.value.code == errors.NOT_ADMITTED.code


async def test_release_returns_stock_and_is_idempotent():
    store, svc = make_fixture(10)
    res = await svc.create("user", "sec", 3, "k")
    await svc.release("user", res.reservation.id)
    await svc.release("user", res.reservation.id)  # idempotent, no double refund
    assert store.sectors["sec"].available_inventory == 10


async def test_sweeper_expires_held():
    store, svc = make_fixture(10)
    svc._clock = FixedClock(datetime(2026, 1, 1, tzinfo=timezone.utc))
    await svc.create("user", "sec", 4, "k")
    svc._clock = FixedClock(datetime(2026, 1, 1, 0, 5, tzinfo=timezone.utc))  # past TTL
    swept = await svc.sweep_expired(100)
    assert swept == 1
    assert store.sectors["sec"].available_inventory == 10
