from __future__ import annotations

from app.domain import errors
from app.domain.models import OrderStatus, Payment, PaymentStatus, ReservationStatus
from app.usecase.ports import (
    IDGenerator,
    OrderRepository,
    PaymentGateway,
    PaymentRepository,
    ReservationRepository,
)


class PaymentService:
    def __init__(
        self,
        orders: OrderRepository,
        reservations: ReservationRepository,
        payments: PaymentRepository,
        gateway: PaymentGateway,
        ids: IDGenerator,
    ):
        self._orders = orders
        self._reservations = reservations
        self._payments = payments
        self._gateway = gateway
        self._ids = ids

    async def process_payment_request(self, order_id: str) -> None:
        """Called by the broker worker per payment.requested message. Records a pending
        payment and asks the gateway to charge; the result arrives via the webhook.
        """
        order = await self._orders.find_by_id(order_id)
        if order is None:
            raise errors.NOT_FOUND
        if order.status != OrderStatus.PENDING:
            return  # already settled; duplicate message, ignore
        provider_ref = await self._gateway.charge(order_id)  # may raise; worker retries
        await self._payments.upsert(
            Payment(
                id=self._ids.new_id(),
                order_id=order_id,
                provider_ref=provider_ref,
                status=PaymentStatus.PENDING,
                attempts=1,
            )
        )

    async def handle_webhook(self, provider_ref: str, order_id: str, succeeded: bool) -> None:
        """Settle an order from a verified provider callback. Signature verification
        happens at the transport edge. Idempotent by provider_ref.
        """
        order = await self._orders.find_by_id(order_id)
        if order is None:
            raise errors.NOT_FOUND

        status = PaymentStatus.SUCCEEDED if succeeded else PaymentStatus.FAILED
        await self._payments.upsert(
            Payment(id=self._ids.new_id(), order_id=order_id, provider_ref=provider_ref, status=status)
        )

        if order.status != OrderStatus.PENDING:
            return  # already settled

        if succeeded:
            await self._orders.update_status(order_id, OrderStatus.PAID.value)
            # The one place the two state machines touch: a paid order confirms its hold.
            await self._reservations.update_status(order.reservation_id, ReservationStatus.CONFIRMED.value)
        else:
            await self._orders.update_status(order_id, OrderStatus.FAILED.value)
