package com.ticketinglabs.client

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.ticketinglabs.client.core.UiState
import com.ticketinglabs.client.demo.DemoEventRepository
import com.ticketinglabs.client.demo.DemoIdempotencyKeyFactory
import com.ticketinglabs.client.demo.DemoOrderRepository
import com.ticketinglabs.client.demo.DemoQueueRepository
import com.ticketinglabs.client.demo.DemoReservationRepository
import com.ticketinglabs.client.domain.model.EventDetail
import com.ticketinglabs.client.domain.model.EventId
import com.ticketinglabs.client.domain.usecase.CreateOrderUseCase
import com.ticketinglabs.client.domain.usecase.CreateReservationUseCase
import com.ticketinglabs.client.presentation.EventsStore
import com.ticketinglabs.client.presentation.OrderStore
import com.ticketinglabs.client.presentation.ReservationStore
import com.ticketinglabs.client.presentation.WaitingRoomStore
import com.ticketinglabs.client.ui.screens.EventDetailScreen
import com.ticketinglabs.client.ui.screens.EventsScreen
import com.ticketinglabs.client.ui.screens.OrderStatusScreen
import com.ticketinglabs.client.ui.screens.ReservationScreen
import com.ticketinglabs.client.ui.screens.SectorSelectionScreen
import com.ticketinglabs.client.ui.screens.WaitingRoomScreen
import com.ticketinglabs.client.ui.theme.TicketingTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private enum class Screen { Events, Detail, Waiting, Sectors, Reservation, Order }

/**
 * The demo app shell: seven screens, one linear flow, wired to the real state holders over
 * in-memory demo repositories. This is the composition root — it constructs the dependency
 * graph (repos → use cases → stores) and drives navigation. On Android/iOS the same screens
 * and stores are used; only this shell and the repositories' HTTP engine differ.
 */
@Composable
fun App() {
    TicketingTheme {
        val scope = rememberCoroutineScope()

        val eventRepo = remember { DemoEventRepository() }
        val queueRepo = remember { DemoQueueRepository() }
        val reservationRepo = remember { DemoReservationRepository() }
        val orderRepo = remember { DemoOrderRepository() }
        val keys = remember { DemoIdempotencyKeyFactory() }

        val eventsStore = remember { EventsStore(eventRepo, scope) }
        val waitingStore = remember { WaitingRoomStore(queueRepo, scope, pollIntervalMs = 800) }
        val reservationStore = remember { ReservationStore(CreateReservationUseCase(reservationRepo), keys, scope) }
        val orderStore = remember { OrderStore(CreateOrderUseCase(orderRepo), orderRepo, keys, scope, pollIntervalMs = 600) }

        var screen by remember { mutableStateOf(Screen.Events) }
        var detail by remember { mutableStateOf<EventDetail?>(null) }
        var remainingMs by remember { mutableStateOf(120_000L) }

        LaunchedEffect(Unit) { eventsStore.load() }

        val eventsState by eventsStore.state.collectAsState()
        val waitingState by waitingStore.state.collectAsState()
        val reservationState by reservationStore.state.collectAsState()
        val orderState by orderStore.state.collectAsState()

        // Drive the hold countdown once a reservation is held.
        LaunchedEffect(reservationState) {
            if (reservationState is UiState.Success) {
                remainingMs = 120_000L
                while (remainingMs > 0) {
                    delay(1_000)
                    remainingMs -= 1_000
                }
            }
        }

        suspend fun loadDetail(id: EventId) {
            when (val r = eventRepo.getEvent(id)) {
                is com.ticketinglabs.client.core.Outcome.Success -> detail = r.value
                is com.ticketinglabs.client.core.Outcome.Failure -> detail = null
            }
        }

        when (screen) {
            Screen.Events -> EventsScreen(
                state = eventsState,
                onOpen = { event ->
                    scope.launch { loadDetail(event.id) }
                    screen = Screen.Detail
                },
                onRetry = { eventsStore.load(isRetry = true) },
            )

            Screen.Detail -> EventDetailScreen(
                state = detail?.let { UiState.Success(it) } ?: UiState.Loading,
                onJoinQueue = {
                    detail?.let { waitingStore.start(it.event.id) }
                    screen = Screen.Waiting
                },
                onRetry = { detail?.let { d -> scope.launch { loadDetail(d.event.id) } } },
            )

            Screen.Waiting -> WaitingRoomScreen(
                state = waitingState,
                onContinue = { screen = Screen.Sectors },
                onRetry = { detail?.let { waitingStore.start(it.event.id) } },
            )

            Screen.Sectors -> detail?.let { d ->
                SectorSelectionScreen(d) { sector, qty ->
                    reservationStore.reserve(sector.id, qty)
                    screen = Screen.Reservation
                }
            }

            Screen.Reservation -> ReservationScreen(
                state = reservationState,
                remainingMs = remainingMs,
                onCheckout = {
                    val held = (reservationState as? UiState.Success)?.data
                    if (held != null) {
                        orderStore.checkout(held.id)
                        screen = Screen.Order
                    }
                },
                onRetry = { detail?.sectors?.firstOrNull()?.let { reservationStore.reserve(it.id, 1) } },
            )

            Screen.Order -> OrderStatusScreen(
                state = orderState,
                onDone = { screen = Screen.Events },
                onRetry = {
                    val held = (reservationState as? UiState.Success)?.data
                    if (held != null) orderStore.checkout(held.id)
                },
            )
        }
    }
}
