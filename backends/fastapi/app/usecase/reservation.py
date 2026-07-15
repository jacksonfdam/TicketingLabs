from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Protocol

from app.domain import errors
from app.domain.models import Reservation, ReservationStatus
from app.usecase.ports import (
    Clock,
    IDGenerator,
    Locker,
    ReservationRepository,
    SectorRepository,
)


class AdmissionChecker(Protocol):
    async def is_admitted(self, user_id: str, event_id: str) -> bool: ...


@dataclass
class CreateResult:
    reservation: Reservation
    replayed: bool


class ReservationService:
    """The most concept-dense code in the backend. One method combines an idempotency
    guard, a distributed lock, an atomic conditional stock decrement, and a TTL hold.
    Read create() slowly; it is the whole point. It mirrors the Go implementation line
    for line, which is exactly what makes the two backends comparable.
    """

    def __init__(
        self,
        reservations: ReservationRepository,
        sectors: SectorRepository,
        locker: Locker,
        admission: AdmissionChecker,
        clock: Clock,
        ids: IDGenerator,
        ttl: timedelta,
    ):
        self._reservations = reservations
        self._sectors = sectors
        self._locker = locker
        self._admission = admission
        self._clock = clock
        self._ids = ids
        self._ttl = ttl if ttl.total_seconds() > 0 else timedelta(minutes=2)
        self._lock_wait = timedelta(seconds=3)

    async def create(self, user_id: str, sector_id: str, qty: int, idem_key: str) -> CreateResult:
        if qty < 1 or qty > 8 or not idem_key:
            raise errors.VALIDATION

        # (1) Idempotency fast path: same key, return the original hold, no work done.
        prior = await self._reservations.find_by_idempotency_key(user_id, idem_key)
        if prior is not None:
            return CreateResult(reservation=prior, replayed=True)

        sector = await self._sectors.find_by_id(sector_id)
        if sector is None:
            raise errors.NOT_FOUND

        # (2) Checkout gate: no admitted queue token for this event, no entry.
        if not await self._admission.is_admitted(user_id, sector.event_id):
            raise errors.NOT_ADMITTED

        # (3) Distributed lock on the sector. Serialises writers so concurrent buyers
        # stop racing, and closes the check-then-insert idempotency window for one
        # sector. It is contention management, NOT the correctness guarantee.
        handle = await self._locker.acquire(f"sector:{sector_id}", self._lock_wait)
        if handle is None:
            raise errors.LOCK_UNAVAILABLE
        try:
            # Re-check inside the lock: a racing request may have created it meanwhile.
            prior = await self._reservations.find_by_idempotency_key(user_id, idem_key)
            if prior is not None:
                return CreateResult(reservation=prior, replayed=True)

            # (4) Atomic conditional decrement. False means not enough left. This one
            # statement is what actually makes overselling impossible.
            if not await self._sectors.decrement_inventory(sector_id, qty):
                raise errors.INVENTORY_EXHAUSTED

            # (5) Create the hold with a TTL. Unpaid holds are swept back later.
            now = self._clock.now()
            res = Reservation(
                id=self._ids.new_id(),
                user_id=user_id,
                sector_id=sector_id,
                quantity=qty,
                status=ReservationStatus.HELD,
                expires_at=now + self._ttl,
                idempotency_key=idem_key,
                created_at=now,
            )
            try:
                await self._reservations.create(res)
            except errors.DomainError as exc:
                # Lost the unique (user_id, idempotency_key) race: give the stock back
                # and return the winner. Correctness survives the window the lock misses.
                await self._sectors.increment_inventory(sector_id, qty)
                if exc is errors.CONFLICT or exc.code == errors.CONFLICT.code:
                    winner = await self._reservations.find_by_idempotency_key(user_id, idem_key)
                    if winner is not None:
                        return CreateResult(reservation=winner, replayed=True)
                raise errors.INTERNAL
            return CreateResult(reservation=res, replayed=False)
        finally:
            await handle.release()

    async def release(self, user_id: str, reservation_id: str) -> None:
        res = await self._reservations.find_by_id(reservation_id)
        if res is None or res.user_id != user_id:
            # Do not confirm existence to a non-owner.
            raise errors.NOT_FOUND
        if res.status != ReservationStatus.HELD:
            return  # already released/expired/confirmed: no-op, still 204
        await self._reservations.update_status(res.id, ReservationStatus.RELEASED.value)
        await self._sectors.increment_inventory(res.sector_id, res.quantity)

    async def sweep_expired(self, limit: int) -> int:
        expired = await self._reservations.find_expired(self._clock.now(), limit)
        swept = 0
        for r in expired:
            await self._reservations.update_status(r.id, ReservationStatus.EXPIRED.value)
            await self._sectors.increment_inventory(r.sector_id, r.quantity)
            swept += 1
        return swept

    async def get(self, reservation_id: str) -> Reservation:
        res = await self._reservations.find_by_id(reservation_id)
        if res is None:
            raise errors.NOT_FOUND
        return res
