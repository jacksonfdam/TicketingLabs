package com.ticketinglabs.client.domain.model

/**
 * The lifecycle of a hold, mirroring the contract's `Reservation.status`.
 */
enum class ReservationStatus {
    /** Held, counting down to expiry. */
    HELD,

    /** Turned into an order. */
    CONFIRMED,

    /** Given back by the user before expiry. */
    RELEASED,

    /** The hold timed out. */
    EXPIRED,
}

/**
 * A hold on a quantity of seats in a sector, mirroring `Reservation`.
 *
 * A reservation is created with an `Idempotency-Key` so a double tap cannot create two.
 * It carries [expiresAt], from which the UI drives a live countdown; when the countdown
 * hits zero the hold is [ReservationStatus.EXPIRED] and the flow starts over.
 *
 * @property quantity number of seats held; the contract allows 1..8.
 * @property expiresAt when the hold lapses if not converted to an order.
 */
data class Reservation(
    val id: ReservationId,
    val userId: UserId,
    val sectorId: SectorId,
    val quantity: Int,
    val status: ReservationStatus,
    val expiresAt: Timestamp,
) {
    /** True while the hold is live and can still be checked out. */
    val isHeld: Boolean get() = status == ReservationStatus.HELD

    init {
        require(quantity >= 1) { "quantity must be >= 1, was $quantity" }
    }
}
