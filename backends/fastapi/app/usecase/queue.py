from __future__ import annotations

from datetime import timedelta

from app.domain import errors
from app.domain.models import QueueStatus, QueueToken
from app.usecase.ports import (
    Clock,
    EventRepository,
    IDGenerator,
    QueueRepository,
    RateLimiter,
)


class QueueService:
    """The pressure valve. Only an admitted token may proceed to checkout; that gate
    is enforced by ReservationService via is_admitted.
    """

    def __init__(
        self,
        queue: QueueRepository,
        events: EventRepository,
        limiter: RateLimiter,
        clock: Clock,
        ids: IDGenerator,
        admit_batch: int,
    ):
        self._queue = queue
        self._events = events
        self._limiter = limiter
        self._clock = clock
        self._ids = ids
        self._admit_batch = admit_batch if admit_batch > 0 else 50

    async def join(self, user_id: str, event_id: str) -> QueueToken:
        if await self._events.find_by_id(event_id) is None:
            raise errors.NOT_FOUND

        # Rate limit joins so a script cannot spam the queue endpoint.
        if not await self._limiter.allow(f"queue_join:{user_id}:{event_id}", 5, timedelta(minutes=1)):
            raise errors.RATE_LIMITED

        existing = await self._queue.find(user_id, event_id)
        if existing is not None:
            return await self._decorate(existing)

        pos = await self._queue.next_position(event_id)
        token = QueueToken(
            id=self._ids.new_id(),
            user_id=user_id,
            event_id=event_id,
            position=pos,
            status=QueueStatus.WAITING,
        )
        await self._queue.upsert(token)
        return await self._decorate(token)

    async def status(self, user_id: str, event_id: str) -> QueueToken:
        token = await self._queue.find(user_id, event_id)
        if token is None:
            raise errors.NOT_FOUND
        return await self._decorate(token)

    async def is_admitted(self, user_id: str, event_id: str) -> bool:
        token = await self._queue.find(user_id, event_id)
        if token is None:
            return False
        token = await self._decorate(token)
        return token.status == QueueStatus.ADMITTED

    async def _decorate(self, token: QueueToken) -> QueueToken:
        # Flip waiting -> admitted once position is within the batch, and persist it.
        if token.status == QueueStatus.WAITING and token.position < self._admit_batch:
            token.status = QueueStatus.ADMITTED
            token.admitted_at = self._clock.now()
            await self._queue.upsert(token)
        return token
