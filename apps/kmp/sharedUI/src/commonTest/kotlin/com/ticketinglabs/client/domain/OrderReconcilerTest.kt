package com.ticketinglabs.client.domain

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.domain.model.OrderStatus
import com.ticketinglabs.client.domain.usecase.OrderReconciler
import com.ticketinglabs.client.domain.usecase.Reconciliation
import kotlin.test.Test
import kotlin.test.assertIs

/**
 * Covers the polling judgement: when to stop, when to keep going, when to give up.
 * Scenarios: `payment-paid`, `payment-delayed-webhook`, `payment-unknown-outcome`.
 */
class OrderReconcilerTest {

    @Test
    fun a_paid_order_resolves() {
        assertIs<Reconciliation.Resolved>(OrderReconciler.next(Outcome.Success(order(OrderStatus.PAID))))
    }

    @Test
    fun a_failed_order_resolves() {
        assertIs<Reconciliation.Resolved>(OrderReconciler.next(Outcome.Success(order(OrderStatus.FAILED))))
    }

    @Test
    fun a_pending_order_keeps_polling() {
        assertIs<Reconciliation.Continue>(OrderReconciler.next(Outcome.Success(order(OrderStatus.PENDING))))
    }

    @Test
    fun a_transient_poll_failure_keeps_polling() {
        assertIs<Reconciliation.Continue>(OrderReconciler.next(Outcome.Failure(AppError.Timeout())))
        assertIs<Reconciliation.Continue>(OrderReconciler.next(Outcome.Failure(AppError.PaymentUnknown())))
        assertIs<Reconciliation.Continue>(OrderReconciler.next(Outcome.Failure(AppError.NetworkUnavailable())))
        assertIs<Reconciliation.Continue>(OrderReconciler.next(Outcome.Failure(AppError.RateLimited())))
    }

    @Test
    fun a_non_transient_poll_failure_aborts() {
        assertIs<Reconciliation.Abort>(OrderReconciler.next(Outcome.Failure(AppError.Unauthorized())))
        assertIs<Reconciliation.Abort>(OrderReconciler.next(Outcome.Failure(AppError.MalformedResponse())))
    }
}
