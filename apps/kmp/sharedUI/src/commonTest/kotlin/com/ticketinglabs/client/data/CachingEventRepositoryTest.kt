package com.ticketinglabs.client.data

import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.data.cache.CachingEventRepository
import com.ticketinglabs.client.domain.model.Event
import com.ticketinglabs.client.domain.model.EventDetail
import com.ticketinglabs.client.domain.model.EventId
import com.ticketinglabs.client.domain.model.EventPage
import com.ticketinglabs.client.domain.model.EventStatus
import com.ticketinglabs.client.domain.model.Timestamp
import com.ticketinglabs.client.domain.port.EventRepository
import kotlinx.coroutines.test.runTest
import kotlin.time.Duration.Companion.seconds
import kotlin.time.TestTimeSource
import kotlin.test.Test
import kotlin.test.assertEquals

/** The read-through cache serves within the TTL, refetches after it, and drops on invalidate. */
class CachingEventRepositoryTest {

    private fun event() = Event(EventId("e1"), "Show", "O2", Timestamp(0), Timestamp(0), EventStatus.ON_SALE)

    private class CountingEvents : EventRepository {
        var listCalls = 0
        var getCalls = 0
        override suspend fun listEvents(cursor: String?, limit: Int?): Outcome<EventPage> {
            listCalls++
            return Outcome.Success(EventPage(listOf(Event(EventId("e1"), "Show", "O2", Timestamp(0), Timestamp(0), EventStatus.ON_SALE)), null))
        }
        override suspend fun getEvent(id: EventId): Outcome<EventDetail> {
            getCalls++
            return Outcome.Success(EventDetail(Event(id, "Show", "O2", Timestamp(0), Timestamp(0), EventStatus.ON_SALE), emptyList()))
        }
    }

    @Test
    fun a_second_read_within_ttl_is_served_from_cache() = runTest {
        val delegate = CountingEvents()
        val cache = CachingEventRepository(delegate, ttl = 30.seconds, timeSource = TestTimeSource())
        cache.listEvents(null, null)
        cache.listEvents(null, null)
        assertEquals(1, delegate.listCalls)
    }

    @Test
    fun a_read_after_the_ttl_refetches() = runTest {
        val delegate = CountingEvents()
        val clock = TestTimeSource()
        val cache = CachingEventRepository(delegate, ttl = 30.seconds, timeSource = clock)
        cache.listEvents(null, null)
        clock += 31.seconds
        cache.listEvents(null, null)
        assertEquals(2, delegate.listCalls)
    }

    @Test
    fun invalidate_forces_a_refetch() = runTest {
        val delegate = CountingEvents()
        val cache = CachingEventRepository(delegate, ttl = 30.seconds, timeSource = TestTimeSource())
        cache.getEvent(EventId("e1"))
        cache.getEvent(EventId("e1"))
        assertEquals(1, delegate.getCalls)
        cache.invalidate()
        cache.getEvent(EventId("e1"))
        assertEquals(2, delegate.getCalls)
    }
}
