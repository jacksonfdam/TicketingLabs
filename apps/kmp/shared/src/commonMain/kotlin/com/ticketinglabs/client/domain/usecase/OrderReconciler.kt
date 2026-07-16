package com.ticketinglabs.client.domain.usecase

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.domain.model.Order

/**
 * The decision produced by [OrderReconciler] for a single poll of an order's status.
 */
sealed interface Reconciliation {
    /** The order reached a terminal outcome ([Order.isSettled]); stop polling. */
    data class Resolved(val order: Order) : Reconciliation

    /** Not settled yet, or a transient hiccup; poll again after the backoff. */
    data object Continue : Reconciliation

    /** A non-transient error; stop polling and surface it. */
    data class Abort(val error: AppError) : Reconciliation
}

/**
 * Turns one order-status poll into a decision, with no timers and no side effects.
 *
 * Kept pure on purpose: the "when do we stop polling" logic is the subtle part of the
 * payment flow, so it lives in a function you can unit-test exhaustively rather than
 * buried in a coroutine loop. The state holder owns the loop and the backoff; this owns
 * the judgement.
 *
 * The rules, and why:
 *  - A settled order ([Order.isSettled]) resolves. Done.
 *  - A still-pending order continues. The webhook may just be late; giving up early is
 *    how you falsely report failure on a payment that actually succeeded.
 *  - A [AppError.PaymentUnknown], [AppError.Timeout] or [AppError.NetworkUnavailable] on
 *    the poll itself is transient — continue. The truth is still out there.
 *  - Any other error aborts. A 401 or a malformed body will not fix itself by polling.
 */
object OrderReconciler {
    /**
     * @param pollResult the outcome of a single `GET /orders/{id}`.
     * @return whether to stop with a resolved order, poll again, or abort with an error.
     */
    fun next(pollResult: Outcome<Order>): Reconciliation = when (pollResult) {
        is Outcome.Success ->
            if (pollResult.value.isSettled) Reconciliation.Resolved(pollResult.value)
            else Reconciliation.Continue

        is Outcome.Failure -> when (pollResult.error) {
            is AppError.PaymentUnknown,
            is AppError.Timeout,
            is AppError.NetworkUnavailable,
            is AppError.RateLimited,
            -> Reconciliation.Continue

            else -> Reconciliation.Abort(pollResult.error)
        }
    }
}
