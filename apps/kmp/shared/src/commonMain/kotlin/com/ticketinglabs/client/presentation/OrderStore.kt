package com.ticketinglabs.client.presentation

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Logger
import com.ticketinglabs.client.core.NoopLogger
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.core.UiState
import com.ticketinglabs.client.domain.model.Order
import com.ticketinglabs.client.domain.model.OrderId
import com.ticketinglabs.client.domain.model.ReservationId
import com.ticketinglabs.client.domain.port.IdempotencyKeyFactory
import com.ticketinglabs.client.domain.port.OrderRepository
import com.ticketinglabs.client.domain.usecase.CreateOrderUseCase
import com.ticketinglabs.client.domain.usecase.OrderReconciler
import com.ticketinglabs.client.domain.usecase.Reconciliation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * State holder for checkout and order settlement — the most careful piece in the app.
 *
 * The flow, and why it is shaped this way:
 *  1. Create the order with one idempotency key, stable across retries of this checkout.
 *  2. If create returns [AppError.PaymentUnknown] (gateway timed out, connection dropped),
 *     do NOT fail. Show a "confirming" state and retry create with the same key — an
 *     idempotent create returns the same order rather than making a second one. This is how
 *     the unknown-outcome case avoids both a double-charge and a false failure.
 *  3. Once an order exists, poll it via [OrderReconciler] until it settles. A late webhook
 *     just means polling runs longer; a transient poll error keeps polling; only a
 *     non-transient error aborts.
 *
 * If create stays unknown past [maxUnknownRetries], the state remains a modelled
 * [AppError.PaymentUnknown] ("confirming payment", recovery = wait) rather than a failure.
 * Nothing here ever reports a payment failed that might have succeeded.
 *
 * @property pollIntervalMs delay between create retries and status polls.
 * @property maxUnknownRetries how many times an unknown create is retried before the UI is
 *   left in the confirming state for the user to wait out.
 */
class OrderStore(
    private val createOrder: CreateOrderUseCase,
    private val orders: OrderRepository,
    private val keys: IdempotencyKeyFactory,
    private val scope: CoroutineScope,
    private val pollIntervalMs: Long = 1_000,
    private val maxUnknownRetries: Int = 5,
    private val logger: Logger = NoopLogger,
) {
    private val _state = MutableStateFlow<UiState<Order>>(UiState.Idle)
    val state: StateFlow<UiState<Order>> = _state.asStateFlow()

    private var job: Job? = null
    private var intentKey: String? = null

    /** Starts checkout for [reservationId]. A no-op if a checkout is already running. */
    fun checkout(reservationId: ReservationId) {
        if (job?.isActive == true) return
        val key = intentKey ?: keys.newKey().also { intentKey = it }
        _state.value = UiState.Loading
        job = scope.launch {
            val order = createReconciling(reservationId, key) ?: return@launch
            _state.value = UiState.Success(order)
            pollUntilSettled(order.id)
        }
    }

    /** Stops polling (e.g. the user left the screen). The order settles server-side regardless. */
    fun stop() {
        job?.cancel()
    }

    /**
     * Creates the order, retrying on [AppError.PaymentUnknown] with the same key. Returns the
     * order once it exists, or null if create failed for a real reason (state already set) or
     * stayed unknown past the retry budget (state left as confirming).
     */
    private suspend fun CoroutineScope.createReconciling(reservationId: ReservationId, key: String): Order? {
        var attempts = 0
        while (isActive) {
            when (val result = createOrder(reservationId, key)) {
                is Outcome.Success -> return result.value
                is Outcome.Failure -> {
                    val error = result.error
                    if (error is AppError.PaymentUnknown) {
                        _state.value = UiState.Error(error) // "confirming payment", recovery = wait
                        if (++attempts >= maxUnknownRetries) return null
                        delay(pollIntervalMs)
                    } else {
                        _state.value = error.toUiState()
                        return null
                    }
                }
            }
        }
        return null
    }

    /** Polls order status until it reaches a terminal outcome or a non-transient error. */
    private suspend fun CoroutineScope.pollUntilSettled(id: OrderId) {
        while (isActive) {
            when (val decision = OrderReconciler.next(orders.get(id))) {
                is Reconciliation.Resolved -> {
                    _state.value = UiState.Success(decision.order)
                    break
                }
                is Reconciliation.Continue -> delay(pollIntervalMs)
                is Reconciliation.Abort -> {
                    _state.value = decision.error.toUiState()
                    break
                }
            }
        }
    }
}
