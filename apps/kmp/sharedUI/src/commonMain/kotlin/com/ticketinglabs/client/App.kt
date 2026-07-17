package com.ticketinglabs.client

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import com.ticketinglabs.client.config.AppConfig
import com.ticketinglabs.client.data.cache.CachingEventRepository
import com.ticketinglabs.client.data.health.HttpReachabilityChecker
import com.ticketinglabs.client.presentation.ConnectivityViewModel
import com.ticketinglabs.client.ui.components.ConnectivityBanner
import com.ticketinglabs.client.core.Outcome
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
import com.ticketinglabs.client.presentation.EventsViewModel
import com.ticketinglabs.client.presentation.OrderViewModel
import com.ticketinglabs.client.presentation.ReservationViewModel
import com.ticketinglabs.client.presentation.WaitingRoomViewModel
import com.ticketinglabs.client.ui.screens.EventDetailScreen
import com.ticketinglabs.client.ui.screens.EventsScreen
import com.ticketinglabs.client.ui.screens.OrderStatusScreen
import com.ticketinglabs.client.ui.screens.ReservationScreen
import com.ticketinglabs.client.ui.screens.SectorSelectionScreen
import com.ticketinglabs.client.ui.screens.WaitingRoomScreen
import com.ticketinglabs.client.theme.AppTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private enum class Screen { Events, Detail, Waiting, Sectors, Reservation, Order }

/**
 * The demo app shell: seven screens, one linear flow, wired to the real ViewModels over
 * in-memory demo repositories. The composition root — it builds the dependency graph
 * (repos → use cases → ViewModels) and drives navigation. This composable lives in
 * commonMain; the Android ([AppActivity]) and iOS ([MainViewController]) entry points both
 * call [App], so only the entry point differs.
 */
@Composable
fun App(onThemeChanged: @Composable (isDark: Boolean) -> Unit = {}) {
    AppTheme(onThemeChanged) {
        val scope = rememberCoroutineScope()

        val eventRepo = remember { CachingEventRepository(DemoEventRepository()) }
        val queueRepo = remember { DemoQueueRepository() }
        val reservationRepo = remember { DemoReservationRepository() }
        val orderRepo = remember { DemoOrderRepository() }
        val keys = remember { DemoIdempotencyKeyFactory() }

        val connectivityVm = viewModel {
            ConnectivityViewModel(HttpReachabilityChecker(AppConfig.DEFAULT_BASE_URL, AppConfig.REACHABILITY_TIMEOUT_MS))
        }
        val connectivity by connectivityVm.state.collectAsState()

        val eventsVm = viewModel { EventsViewModel(eventRepo) }
        val waitingVm = viewModel { WaitingRoomViewModel(queueRepo, pollIntervalMs = 800) }
        val reservationVm = viewModel { ReservationViewModel(CreateReservationUseCase(reservationRepo), keys) }
        val orderVm = viewModel { OrderViewModel(CreateOrderUseCase(orderRepo), orderRepo, keys, pollIntervalMs = 600) }

        var screen by remember { mutableStateOf(Screen.Events) }
        var detail by remember { mutableStateOf<EventDetail?>(null) }
        var remainingMs by remember { mutableStateOf(120_000L) }

        LaunchedEffect(Unit) { eventsVm.load() }

        val eventsState by eventsVm.state.collectAsState()
        val waitingState by waitingVm.state.collectAsState()
        val reservationState by reservationVm.state.collectAsState()
        val orderState by orderVm.state.collectAsState()

        // Drive the hold countdown once a reservation is held; the hold changed availability,
        // so drop the cached events/detail (they refetch on next view).
        LaunchedEffect(reservationState) {
            if (reservationState is UiState.Success) {
                eventRepo.invalidate()
                remainingMs = 120_000L
                while (remainingMs > 0) {
                    delay(1_000)
                    remainingMs -= 1_000
                }
            }
        }

        suspend fun loadDetail(id: EventId) {
            detail = when (val r = eventRepo.getEvent(id)) {
                is Outcome.Success -> r.value
                is Outcome.Failure -> null
            }
        }

        Column(Modifier.fillMaxSize()) {
        ConnectivityBanner(connectivity, onRetry = { connectivityVm.check() })
        Box(Modifier.weight(1f)) {
        when (screen) {
            Screen.Events -> EventsScreen(
                state = eventsState,
                onOpen = { event ->
                    scope.launch { loadDetail(event.id) }
                    screen = Screen.Detail
                },
                onRetry = { eventsVm.load(isRetry = true) },
            )

            Screen.Detail -> EventDetailScreen(
                state = detail?.let { UiState.Success(it) } ?: UiState.Loading,
                onJoinQueue = {
                    detail?.let { waitingVm.start(it.event.id) }
                    screen = Screen.Waiting
                },
                onRetry = { detail?.let { d -> scope.launch { loadDetail(d.event.id) } } },
            )

            Screen.Waiting -> WaitingRoomScreen(
                state = waitingState,
                onContinue = { screen = Screen.Sectors },
                onRetry = { detail?.let { waitingVm.start(it.event.id) } },
            )

            Screen.Sectors -> detail?.let { d ->
                SectorSelectionScreen(d) { sector, qty ->
                    reservationVm.reserve(sector.id, qty)
                    screen = Screen.Reservation
                }
            }

            Screen.Reservation -> ReservationScreen(
                state = reservationState,
                remainingMs = remainingMs,
                onCheckout = {
                    val held = (reservationState as? UiState.Success)?.data
                    if (held != null) {
                        orderVm.checkout(held.id)
                        screen = Screen.Order
                    }
                },
                onRetry = { detail?.sectors?.firstOrNull()?.let { reservationVm.reserve(it.id, 1) } },
            )

            Screen.Order -> OrderStatusScreen(
                state = orderState,
                onDone = { screen = Screen.Events },
                onRetry = {
                    val held = (reservationState as? UiState.Success)?.data
                    if (held != null) orderVm.checkout(held.id)
                },
            )
        }
        }
        }
    }
}
