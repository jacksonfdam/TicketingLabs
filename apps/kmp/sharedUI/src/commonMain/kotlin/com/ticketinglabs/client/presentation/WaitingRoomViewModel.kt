package com.ticketinglabs.client.presentation

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Logger
import com.ticketinglabs.client.core.NoopLogger
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.core.UiState
import com.ticketinglabs.client.domain.model.EventId
import com.ticketinglabs.client.domain.model.QueueToken
import com.ticketinglabs.client.domain.port.QueueRepository
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * State holder for the waiting room: join the queue, then poll position until admitted.
 *
 * Degrades gracefully under load, which is the whole point of a queue. A [AppError.RateLimited]
 * response is not an error to show the user — it is a signal to back off, so the loop waits
 * for `Retry-After` and carries on. A transient [AppError.Timeout] or
 * [AppError.NetworkUnavailable] on a poll is likewise swallowed and retried; only a
 * non-transient failure stops the loop and surfaces an error.
 *
 * @property pollIntervalMs base delay between position polls.
 */
class WaitingRoomViewModel(
    private val queue: QueueRepository,
    private val pollIntervalMs: Long = 1_500,
    private val logger: Logger = NoopLogger,
) : ViewModel() {
    private val _state = MutableStateFlow<UiState<QueueToken>>(UiState.Idle)
    val state: StateFlow<UiState<QueueToken>> = _state.asStateFlow()

    private var job: Job? = null

    /** Joins the queue for [eventId] and polls until admitted. A no-op if already running. */
    fun start(eventId: EventId) {
        if (job?.isActive == true) return
        _state.value = UiState.Loading
        job = viewModelScope.launch {
            when (val joined = queue.join(eventId)) {
                is Outcome.Success -> _state.value = UiState.Success(joined.value)
                is Outcome.Failure -> {
                    _state.value = joined.error.toUiState()
                    return@launch
                }
            }
            while (isActive) {
                if ((_state.value as? UiState.Success)?.data?.isAdmitted == true) break
                delay(pollIntervalMs)
                when (val status = queue.status(eventId)) {
                    is Outcome.Success -> _state.value = UiState.Success(status.value)
                    is Outcome.Failure -> when (val e = status.error) {
                        is AppError.RateLimited -> delay((e.retryAfterSeconds ?: 1).toLong() * 1_000)
                        is AppError.Timeout, is AppError.NetworkUnavailable -> Unit // transient; keep polling
                        else -> {
                            _state.value = e.toUiState()
                            break
                        }
                    }
                }
            }
        }
    }

    /** Stops polling (e.g. the user left the screen). */
    fun stop() {
        job?.cancel()
    }
}
