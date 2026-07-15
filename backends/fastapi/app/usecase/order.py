from __future__ import annotations

import json

from app.domain import errors
from app.domain.models import Order, OrderStatus, ReservationStatus
from app.usecase.ports import (
    IDGenerator,
    OrderRepository,
    Publisher,
    ReservationRepository,
    SectorRepository,
)

# The broker topic a new order publishes to. The payment worker consumes it and calls
# the external gateway. This is what makes payment asynchronous.
TOPIC_PAYMENT_REQUESTED = "payment.requested"


class OrderService:
    def __init__(
        self,
        orders: OrderRepository,
        reservations: ReservationRepository,
        sectors: SectorRepository,
        publisher: Publisher,
        ids: IDGenerator,
    ):
        self._orders = orders
        self._reservations = reservations
        self._sectors = sectors
        self._publisher = publisher
        self._ids = ids

    async def create(self, user_id: str, reservation_id: str, idem_key: str) -> Order:
        if not idem_key:
            raise errors.VALIDATION

        prior = await self._orders.find_by_idempotency_key(user_id, idem_key)
        if prior is not None:
            return prior

        res = await self._reservations.find_by_id(reservation_id)
        if res is None or res.user_id != user_id:
            raise errors.NOT_FOUND
        if res.status != ReservationStatus.HELD:
            raise errors.RESERVATION_STATE

        existing = await self._orders.find_by_reservation_id(reservation_id)
        if existing is not None:
            return existing

        sector = await self._sectors.find_by_id(res.sector_id)
        if sector is None:
            raise errors.INTERNAL

        order = Order(
            id=self._ids.new_id(),
            reservation_id=reservation_id,
            user_id=user_id,
            amount_cents=sector.price_cents * res.quantity,
            status=OrderStatus.PENDING,
            idempotency_key=idem_key,
        )
        try:
            await self._orders.create(order)
        except errors.DomainError:
            winner = await self._orders.find_by_idempotency_key(user_id, idem_key)
            if winner is not None:
                return winner
            raise errors.INTERNAL

        # A failed publish is recoverable by reconciliation; the order is already
        # pending, so we do not fail the request over it.
        try:
            await self._publisher.publish(
                TOPIC_PAYMENT_REQUESTED, json.dumps({"order_id": order.id}).encode()
            )
        except Exception:  # noqa: BLE001 - broker hiccup must not fail order creation
            pass
        return order

    async def get(self, order_id: str) -> Order:
        order = await self._orders.find_by_id(order_id)
        if order is None:
            raise errors.NOT_FOUND
        return order
