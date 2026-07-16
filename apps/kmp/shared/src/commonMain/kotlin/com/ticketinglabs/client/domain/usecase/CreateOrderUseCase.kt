package com.ticketinglabs.client.domain.usecase

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.domain.model.Order
import com.ticketinglabs.client.domain.model.ReservationId
import com.ticketinglabs.client.domain.port.OrderRepository

/**
 * Creates an order from a confirmed reservation, kicking off asynchronous payment.
 *
 * This use case exists mostly to get one thing right: when the create does not return a
 * clear answer — the gateway timed out, or the connection dropped mid-request — the
 * outcome is **unknown**, not failed. Mapping that to [AppError.PaymentUnknown] tells the
 * caller to reconcile (retry with the same key, then poll), never to report failure and
 * never to charge again. Reporting a false failure here is how you double-charge someone.
 *
 * The [idempotencyKey] is caller-owned and must be stable across retries of the same
 * checkout: a retried create with the same key returns the same order rather than a
 * second one.
 *
 * Failure behaviour: [AppError.PaymentUnknown] for a timeout or network drop during
 * create; otherwise the repository's mapped error (e.g. [AppError.Conflict] if the
 * reservation expired, [AppError.ServerError]).
 */
class CreateOrderUseCase(
    private val orders: OrderRepository,
) {
    /**
     * @param reservationId the confirmed reservation to bill.
     * @param idempotencyKey stable key for this checkout intent; reuse it on retry.
     * @return the created order (status pending) on success; a typed failure otherwise,
     *   with unresolved outcomes surfaced as [AppError.PaymentUnknown].
     */
    suspend operator fun invoke(
        reservationId: ReservationId,
        idempotencyKey: String,
    ): Outcome<Order> = when (val result = orders.create(reservationId, idempotencyKey)) {
        is Outcome.Success -> result
        is Outcome.Failure -> when (result.error) {
            is AppError.Timeout, is AppError.NetworkUnavailable -> Outcome.Failure(
                AppError.PaymentUnknown(
                    requestId = result.error.requestId,
                    cause = "order create unresolved (${result.error.code}); reconcile by retrying with the same key or polling",
                ),
            )
            else -> result
        }
    }
}
