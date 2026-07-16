package com.ticketinglabs.client.domain.model

/**
 * The lifecycle of an order, mirroring the contract's `Order.status`.
 *
 * Note there is no `TIMEOUT` value here, on purpose: the contract's server-owned states
 * are exactly these four. "The app gave up waiting" is a client-side concern modelled as
 * an [com.ticketinglabs.client.core.AppError.PaymentUnknown], never a server status. See
 * `docs/client-state-machines.md`.
 */
enum class OrderStatus {
    /** Created; payment is being processed asynchronously. */
    PENDING,

    /** Payment confirmed. */
    PAID,

    /** Payment failed. */
    FAILED,

    /** A previously paid order was refunded. */
    REFUNDED,
}

/**
 * An order created from a confirmed reservation, mirroring `Order`.
 *
 * Payment is asynchronous: an order is born [OrderStatus.PENDING] and settles to
 * [OrderStatus.PAID] or [OrderStatus.FAILED] later, observed by polling. A paid order may
 * still move to [OrderStatus.REFUNDED].
 *
 * @property amount the total charged, in minor units.
 * @property createdAt when the order was created.
 */
data class Order(
    val id: OrderId,
    val reservationId: ReservationId,
    val userId: UserId,
    val amount: Money,
    val status: OrderStatus,
    val createdAt: Timestamp,
) {
    /** True while the order has not yet reached a terminal payment outcome. */
    val isPending: Boolean get() = status == OrderStatus.PENDING

    /** True once the order has settled one way or the other (paid, failed, or refunded). */
    val isSettled: Boolean get() = status != OrderStatus.PENDING
}
