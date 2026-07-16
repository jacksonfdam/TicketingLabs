package com.ticketinglabs.client.presentation

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.core.UiState
import com.ticketinglabs.client.domain.model.Order
import com.ticketinglabs.client.domain.model.OrderId
import com.ticketinglabs.client.domain.model.OrderStatus
import com.ticketinglabs.client.domain.model.ReservationId
import com.ticketinglabs.client.domain.order
import com.ticketinglabs.client.domain.port.IdempotencyKeyFactory
import com.ticketinglabs.client.domain.port.OrderRepository
import com.ticketinglabs.client.domain.usecase.CreateOrderUseCase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * Drives [OrderStore] through the payment matrix with virtual time. Scenarios:
 * `payment-paid`, `payment-delayed-webhook`, `payment-unknown-outcome`, `payment-network-drop`.
 */
class OrderStoreTest {

    /** Returns each scripted response once, then repeats the last (safe against overrun). */
    private class ScriptedOrderRepo(
        createScript: List<Outcome<Order>>,
        getScript: List<Outcome<Order>>,
        private val createDelayMs: Long = 0,
    ) : OrderRepository {
        private val creates = ArrayDeque(createScript)
        private val gets = ArrayDeque(getScript)
        val createKeys = mutableListOf<String>()

        override suspend fun create(reservationId: ReservationId, idempotencyKey: String): Outcome<Order> {
            if (createDelayMs > 0) kotlinx.coroutines.delay(createDelayMs)
            createKeys += idempotencyKey
            return if (creates.size > 1) creates.removeFirst() else creates.first()
        }

        override suspend fun get(id: OrderId): Outcome<Order> =
            if (gets.size > 1) gets.removeFirst() else gets.first()
    }

    private val fixedKeys = object : IdempotencyKeyFactory {
        override fun newKey() = "fixed-key"
    }

    private fun store(repo: ScriptedOrderRepo, scope: kotlinx.coroutines.CoroutineScope) =
        OrderStore(CreateOrderUseCase(repo), repo, fixedKeys, scope, pollIntervalMs = 10)

    @Test
    fun happy_path_settles_to_paid_after_polling() = runTest {
        val repo = ScriptedOrderRepo(
            createScript = listOf(Outcome.Success(order(OrderStatus.PENDING))),
            getScript = listOf(
                Outcome.Success(order(OrderStatus.PENDING)),
                Outcome.Success(order(OrderStatus.PENDING)),
                Outcome.Success(order(OrderStatus.PAID)),
            ),
        )
        val store = store(repo, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))

        store.checkout(ReservationId("r1"))
        advanceUntilIdle()

        val state = store.state.value
        assertIs<UiState.Success<Order>>(state)
        assertEquals(OrderStatus.PAID, state.data.status)
    }

    @Test
    fun unknown_outcome_on_create_is_reconciled_with_the_same_key() = runTest {
        val repo = ScriptedOrderRepo(
            createScript = listOf(
                Outcome.Failure(AppError.PaymentUnknown()),
                Outcome.Failure(AppError.PaymentUnknown()),
                Outcome.Success(order(OrderStatus.PENDING)),
            ),
            getScript = listOf(Outcome.Success(order(OrderStatus.PAID))),
        )
        val store = store(repo, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))

        store.checkout(ReservationId("r1"))
        advanceUntilIdle()

        val state = store.state.value
        assertIs<UiState.Success<Order>>(state)
        assertEquals(OrderStatus.PAID, state.data.status)
        // All create attempts must reuse the one intent key, so the server dedupes.
        assertEquals(listOf("fixed-key", "fixed-key", "fixed-key"), repo.createKeys)
    }

    @Test
    fun an_order_that_settles_to_failed_is_surfaced_as_a_resolved_failed_order() = runTest {
        val repo = ScriptedOrderRepo(
            createScript = listOf(Outcome.Success(order(OrderStatus.PENDING))),
            getScript = listOf(Outcome.Success(order(OrderStatus.FAILED))),
        )
        val store = store(repo, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))

        store.checkout(ReservationId("r1"))
        advanceUntilIdle()

        val state = store.state.value
        assertIs<UiState.Success<Order>>(state)
        assertEquals(OrderStatus.FAILED, state.data.status)
    }

    @Test
    fun a_real_failure_on_create_surfaces_as_an_error() = runTest {
        val repo = ScriptedOrderRepo(
            createScript = listOf(Outcome.Failure(AppError.Conflict(backendCode = "reservation_expired"))),
            getScript = listOf(Outcome.Success(order(OrderStatus.PENDING))),
        )
        val store = store(repo, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))

        store.checkout(ReservationId("r1"))
        advanceUntilIdle()

        assertIs<UiState.Error>(store.state.value)
    }

    @Test
    fun a_second_checkout_while_one_is_running_is_ignored() = runTest {
        val repo = ScriptedOrderRepo(
            createScript = listOf(Outcome.Success(order(OrderStatus.PENDING))),
            getScript = listOf(Outcome.Success(order(OrderStatus.PAID))),
            createDelayMs = 50, // keeps the first checkout in flight when the second arrives
        )
        val store = store(repo, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))

        store.checkout(ReservationId("r1"))
        store.checkout(ReservationId("r1")) // ignored: first is in flight
        advanceUntilIdle()

        assertEquals(1, repo.createKeys.size)
    }
}
