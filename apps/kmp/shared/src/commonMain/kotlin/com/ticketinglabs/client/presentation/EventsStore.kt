package com.ticketinglabs.client.presentation

import com.ticketinglabs.client.core.Logger
import com.ticketinglabs.client.core.NoopLogger
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.core.UiState
import com.ticketinglabs.client.domain.model.Event
import com.ticketinglabs.client.domain.port.EventRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * State holder for the events list screen.
 *
 * Exposes a single [StateFlow] of [UiState] that the UI renders as a pure function: the
 * screen shows a spinner because the state is [UiState.Loading], not because a list happened
 * to be null. An empty page is [UiState.Empty], a failure is a typed error state, and a
 * refresh after failure is [UiState.Retrying].
 *
 * Framework-free: it takes a [CoroutineScope] rather than owning one, so it is trivially
 * driven from a test with virtual time and adapts to a ViewModel scope in the UI module.
 *
 * @property events the repository port.
 * @property scope the scope loads run in.
 * @property logger structured logging sink.
 */
class EventsStore(
    private val events: EventRepository,
    private val scope: CoroutineScope,
    private val logger: Logger = NoopLogger,
) {
    private val _state = MutableStateFlow<UiState<List<Event>>>(UiState.Idle)
    val state: StateFlow<UiState<List<Event>>> = _state.asStateFlow()

    private var inFlight: Job? = null

    /**
     * Loads (or reloads) the first page of events. A load already in flight is a no-op, so a
     * double pull-to-refresh does not fire two requests.
     *
     * @param isRetry true when triggered by the user after a failure; drives [UiState.Retrying].
     */
    fun load(isRetry: Boolean = false) {
        if (inFlight?.isActive == true) return
        _state.value = if (isRetry) UiState.Retrying else UiState.Loading
        inFlight = scope.launch {
            _state.value = when (val result = events.listEvents(cursor = null, limit = null)) {
                is Outcome.Success ->
                    if (result.value.events.isEmpty()) UiState.Empty
                    else UiState.Success(result.value.events)
                is Outcome.Failure -> result.error.toUiState()
            }
        }
    }
}
