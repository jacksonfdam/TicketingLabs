package com.ticketinglabs.client.presentation

import com.ticketinglabs.client.core.Logger
import com.ticketinglabs.client.core.NoopLogger
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.core.UiState
import com.ticketinglabs.client.domain.model.Reservation
import com.ticketinglabs.client.domain.model.SectorId
import com.ticketinglabs.client.domain.port.IdempotencyKeyFactory
import com.ticketinglabs.client.domain.usecase.CreateReservationUseCase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * State holder for the reservation screen, home of the double-tap problem.
 *
 * Two defences, belt and braces:
 *  1. A request already in flight makes [reserve] a no-op, so a second tap while the first
 *     is pending does nothing.
 *  2. One idempotency key is generated per intent and reused across retries. Even if two
 *     requests somehow escape, the server deduplicates on the key and only one hold is made.
 *
 * [reset] clears the intent (new key next time) for a genuinely new reservation — e.g. after
 * the hold expires or the user goes back and starts over.
 */
class ReservationStore(
    private val createReservation: CreateReservationUseCase,
    private val keys: IdempotencyKeyFactory,
    private val scope: CoroutineScope,
    private val logger: Logger = NoopLogger,
) {
    private val _state = MutableStateFlow<UiState<Reservation>>(UiState.Idle)
    val state: StateFlow<UiState<Reservation>> = _state.asStateFlow()

    private var inFlight: Job? = null
    private var intentKey: String? = null

    /**
     * Creates a hold. Ignored if one is already in flight (double-tap guard). Reuses the
     * intent's idempotency key so a retry cannot create a second reservation.
     */
    fun reserve(sectorId: SectorId, quantity: Int) {
        if (inFlight?.isActive == true) return
        val key = intentKey ?: keys.newKey().also { intentKey = it }
        _state.value = UiState.Loading
        inFlight = scope.launch {
            _state.value = when (val result = createReservation(sectorId, quantity, key)) {
                is Outcome.Success -> UiState.Success(result.value)
                is Outcome.Failure -> result.error.toUiState()
            }
        }
    }

    /** Drops the current intent so the next [reserve] starts a fresh hold with a new key. */
    fun reset() {
        intentKey = null
        _state.value = UiState.Idle
    }
}
