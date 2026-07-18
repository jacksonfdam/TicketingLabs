package com.ticketinglabs.client.data.cache

import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.domain.model.EventDetail
import com.ticketinglabs.client.domain.model.EventId
import com.ticketinglabs.client.domain.model.EventPage
import com.ticketinglabs.client.domain.port.EventRepository
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlin.time.TimeMark
import kotlin.time.TimeSource

/**
 * A read-through cache in front of an [EventRepository]. The first page and each event detail
 * are cached for [ttl] (matching the events endpoint's `Cache-Control: max-age=30`), so a
 * pull-to-refresh within the window is free and does not flash a spinner. Only successes are
 * cached — a failure is never remembered. [invalidate] drops everything, which the reservation
 * flow calls because a hold changes availability.
 *
 * The [timeSource] is injected so tests advance time deterministically.
 */
class CachingEventRepository(
    private val delegate: EventRepository,
    private val ttl: Duration = 30.seconds,
    private val timeSource: TimeSource = TimeSource.Monotonic,
) : EventRepository {

    private class Entry<T>(val value: T, val mark: TimeMark)

    private var pageEntry: Entry<EventPage>? = null
    private val detailEntries = mutableMapOf<EventId, Entry<EventDetail>>()

    override suspend fun listEvents(cursor: String?, limit: Int?): Outcome<EventPage> {
        // Only the first page is cached; deeper pages are cursor-specific and rare.
        if (cursor == null) {
            pageEntry?.let { if (it.mark.elapsedNow() < ttl) return Outcome.Success(it.value) }
        }
        val result = delegate.listEvents(cursor, limit)
        if (cursor == null && result is Outcome.Success) {
            pageEntry = Entry(result.value, timeSource.markNow())
        }
        return result
    }

    override suspend fun getEvent(id: EventId): Outcome<EventDetail> {
        detailEntries[id]?.let { if (it.mark.elapsedNow() < ttl) return Outcome.Success(it.value) }
        val result = delegate.getEvent(id)
        if (result is Outcome.Success) {
            detailEntries[id] = Entry(result.value, timeSource.markNow())
        }
        return result
    }

    /** Drops all cached reads. Called after a reservation, since availability changed. */
    fun invalidate() {
        pageEntry = null
        detailEntries.clear()
    }
}
