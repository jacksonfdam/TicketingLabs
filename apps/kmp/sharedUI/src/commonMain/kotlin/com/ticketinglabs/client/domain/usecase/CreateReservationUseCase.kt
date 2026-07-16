package com.ticketinglabs.client.domain.usecase

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.domain.model.Reservation
import com.ticketinglabs.client.domain.model.SectorId
import com.ticketinglabs.client.domain.port.ReservationRepository

/**
 * Creates a hold on a quantity of seats.
 *
 * Two defences live here. First, **input hardening**: the quantity is validated against
 * the contract's allowed range before anything is sent, so a bad value becomes a typed
 * [AppError.Validation] rather than a round trip that the server rejects. Second,
 * **idempotency**: the [idempotencyKey] is supplied by the caller and must be stable
 * across retries of the same user intent. A double tap that fires two requests with the
 * same key produces one reservation, because the server deduplicates on it.
 *
 * The key is a parameter, not generated here, precisely so a retry can reuse it. Generate
 * one key per "reserve" intent (see the state holder), not one per network attempt.
 *
 * Failure behaviour: [AppError.Validation] for an out-of-range quantity; otherwise
 * whatever the repository maps the response to (e.g. [AppError.Conflict] when sold out,
 * [AppError.Timeout], [AppError.MalformedResponse]).
 */
class CreateReservationUseCase(
    private val reservations: ReservationRepository,
) {
    /**
     * @param sectorId the sector to hold seats in.
     * @param quantity how many seats; must be in [QUANTITY_RANGE].
     * @param idempotencyKey stable key for this reservation intent; reuse it on retry.
     * @return the created (or idempotently re-returned) reservation, or a typed failure.
     */
    suspend operator fun invoke(
        sectorId: SectorId,
        quantity: Int,
        idempotencyKey: String,
    ): Outcome<Reservation> {
        if (quantity !in QUANTITY_RANGE) {
            return Outcome.Failure(
                AppError.Validation(cause = "quantity $quantity outside $QUANTITY_RANGE"),
            )
        }
        return reservations.create(sectorId, quantity, idempotencyKey)
    }

    companion object {
        /** The contract allows 1..8 seats per reservation. */
        val QUANTITY_RANGE = 1..8
    }
}
