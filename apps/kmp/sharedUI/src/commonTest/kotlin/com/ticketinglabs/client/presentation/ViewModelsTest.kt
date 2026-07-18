package com.ticketinglabs.client.presentation

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.core.UiState
import com.ticketinglabs.client.domain.model.Event
import com.ticketinglabs.client.domain.model.EventId
import com.ticketinglabs.client.domain.model.EventPage
import com.ticketinglabs.client.domain.model.EventStatus
import com.ticketinglabs.client.domain.model.QueueStatus
import com.ticketinglabs.client.domain.model.QueueToken
import com.ticketinglabs.client.domain.model.QueueTokenId
import com.ticketinglabs.client.domain.model.Reservation
import com.ticketinglabs.client.domain.model.ReservationId
import com.ticketinglabs.client.domain.model.ReservationStatus
import com.ticketinglabs.client.domain.model.SectorId
import com.ticketinglabs.client.domain.model.Timestamp
import com.ticketinglabs.client.domain.model.UserId
import com.ticketinglabs.client.domain.port.EventRepository
import com.ticketinglabs.client.domain.port.IdempotencyKeyFactory
import com.ticketinglabs.client.domain.port.QueueRepository
import com.ticketinglabs.client.domain.port.ReservationRepository
import com.ticketinglabs.client.domain.usecase.CreateReservationUseCase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * Covers the read/queue/reservation ViewModels. Because they launch in `viewModelScope`
 * (backed by `Dispatchers.Main`), each test points Main at the test scheduler so virtual
 * time drives the coroutines.
 */
class ViewModelsTest {

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    private class FakeEvents(private val result: Outcome<EventPage>) : EventRepository {
        override suspend fun listEvents(cursor: String?, limit: Int?) = result
        override suspend fun getEvent(id: EventId) = Outcome.Failure(AppError.Unknown())
    }

    private fun sampleEvent() = Event(EventId("e1"), "Show", "O2", Timestamp(0), Timestamp(0), EventStatus.ON_SALE)
    private fun sampleReservation() =
        Reservation(ReservationId("r1"), UserId("u1"), SectorId("s1"), 2, ReservationStatus.HELD, Timestamp(0))

    @Test
    fun events_success_maps_to_Success() = runTest {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))
        val vm = EventsViewModel(FakeEvents(Outcome.Success(EventPage(listOf(sampleEvent()), null))))
        vm.load()
        advanceUntilIdle()
        val state = vm.state.value
        assertIs<UiState.Success<List<Event>>>(state)
        assertEquals(1, state.data.size)
    }

    @Test
    fun an_empty_page_maps_to_Empty() = runTest {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))
        val vm = EventsViewModel(FakeEvents(Outcome.Success(EventPage(emptyList(), null))))
        vm.load()
        advanceUntilIdle()
        assertIs<UiState.Empty>(vm.state.value)
    }

    @Test
    fun a_network_failure_maps_to_Error_but_a_timeout_maps_to_TimedOut() = runTest {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))
        val net = EventsViewModel(FakeEvents(Outcome.Failure(AppError.NetworkUnavailable())))
        net.load()
        advanceUntilIdle()
        assertIs<UiState.Error>(net.state.value)

        val slow = EventsViewModel(FakeEvents(Outcome.Failure(AppError.Timeout())))
        slow.load()
        advanceUntilIdle()
        assertIs<UiState.TimedOut>(slow.state.value)
    }

    @Test
    fun reservation_double_tap_fires_one_request_with_one_key() = runTest {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))
        // A delaying repo keeps the first request in flight when the second tap arrives.
        val repo = object : ReservationRepository {
            val keysSeen = mutableListOf<String>()
            override suspend fun create(sectorId: SectorId, quantity: Int, idempotencyKey: String): Outcome<Reservation> {
                delay(50)
                keysSeen += idempotencyKey
                return Outcome.Success(sampleReservation())
            }
            override suspend fun release(id: ReservationId) = Outcome.Success(Unit)
        }
        val keys = object : IdempotencyKeyFactory {
            var n = 0
            override fun newKey() = "key-${n++}"
        }
        val vm = ReservationViewModel(CreateReservationUseCase(repo), keys)

        vm.reserve(SectorId("s1"), 2)
        vm.reserve(SectorId("s1"), 2) // ignored: first in flight
        advanceUntilIdle()

        assertEquals(listOf("key-0"), repo.keysSeen)
        assertIs<UiState.Success<*>>(vm.state.value)
    }

    @Test
    fun waiting_room_transitions_to_admitted() = runTest {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))
        val waiting = QueueToken(QueueTokenId("q1"), UserId("u1"), EventId("e1"), 5, QueueStatus.WAITING, null)
        val admitted = waiting.copy(position = 0, status = QueueStatus.ADMITTED, admittedAt = Timestamp(1))
        val queue = object : QueueRepository {
            override suspend fun join(eventId: EventId) = Outcome.Success(waiting)
            private val statuses = ArrayDeque(listOf(Outcome.Success(waiting), Outcome.Success(admitted)))
            override suspend fun status(eventId: EventId) =
                if (statuses.size > 1) statuses.removeFirst() else statuses.first()
        }
        val vm = WaitingRoomViewModel(queue, pollIntervalMs = 10)

        vm.start(EventId("e1"))
        advanceUntilIdle()

        val state = vm.state.value
        assertIs<UiState.Success<QueueToken>>(state)
        assertEquals(QueueStatus.ADMITTED, state.data.status)
    }
}
