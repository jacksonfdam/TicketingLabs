package com.ticketinglabs.client.domain.port

import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.domain.model.EventDetail
import com.ticketinglabs.client.domain.model.EventId
import com.ticketinglabs.client.domain.model.EventPage
import com.ticketinglabs.client.domain.model.Order
import com.ticketinglabs.client.domain.model.OrderId
import com.ticketinglabs.client.domain.model.QueueToken
import com.ticketinglabs.client.domain.model.Reservation
import com.ticketinglabs.client.domain.model.ReservationId
import com.ticketinglabs.client.domain.model.SectorId

/**
 * Repository ports. These are the boundary between business logic and the outside world.
 *
 * Use cases depend on these interfaces, never on a concrete HTTP client. A port returns a
 * validated domain model wrapped in an [Outcome]; the adapter behind it is responsible for
 * turning a raw contract DTO into that model, or into an
 * [com.ticketinglabs.client.core.AppError] — invalid data becomes a typed failure, never
 * an exception that escapes. Because they are interfaces, tests inject fakes and run in
 * milliseconds without a network.
 */

/** Reads events and their sectors. */
interface EventRepository {
    /**
     * Lists events, one page at a time.
     * @param cursor opaque cursor from a previous page, or null for the first page.
     * @param limit page size hint; the server clamps it to its own bounds.
     * @return a page of events, or a typed failure (network, timeout, malformed, server).
     */
    suspend fun listEvents(cursor: String?, limit: Int?): Outcome<EventPage>

    /**
     * Fetches one event with its sectors.
     * @return the event detail, or a typed failure (including [com.ticketinglabs.client.core.AppError.MalformedResponse]).
     */
    suspend fun getEvent(id: EventId): Outcome<EventDetail>
}

/** Joins and polls the virtual queue. */
interface QueueRepository {
    /**
     * Joins the waiting room for an event.
     * @return the issued queue token, or a typed failure.
     */
    suspend fun join(eventId: EventId): Outcome<QueueToken>

    /**
     * Reads the current queue position/status. Polled until admitted.
     * @return the current token, or a typed failure (rate-limited backs off polling).
     */
    suspend fun status(eventId: EventId): Outcome<QueueToken>
}

/** Creates and releases holds. */
interface ReservationRepository {
    /**
     * Creates a hold. The [idempotencyKey] makes a retried create a no-op, so a double
     * tap or a network retry cannot produce two reservations.
     * @return the created (or idempotently re-returned) reservation, or a typed failure
     *   (e.g. [com.ticketinglabs.client.core.AppError.Conflict] when sold out).
     */
    suspend fun create(sectorId: SectorId, quantity: Int, idempotencyKey: String): Outcome<Reservation>

    /**
     * Releases a hold the user backed out of.
     * @return success, or a typed failure.
     */
    suspend fun release(id: ReservationId): Outcome<Unit>
}

/** Creates orders and reads their (asynchronously settled) status. */
interface OrderRepository {
    /**
     * Creates an order from a confirmed reservation, triggering asynchronous payment. The
     * [idempotencyKey] protects retries after a network drop or an unknown-outcome timeout.
     * @return the created order (status pending), or a typed failure. A timeout maps to
     *   [com.ticketinglabs.client.core.AppError.PaymentUnknown], never to a false failure.
     */
    suspend fun create(reservationId: ReservationId, idempotencyKey: String): Outcome<Order>

    /**
     * Reads current order status. Polled while pending to reconcile the payment outcome.
     * @return the current order, or a typed failure.
     */
    suspend fun get(id: OrderId): Outcome<Order>
}

/**
 * Produces client-side idempotency keys. A port, not a free function, so tests can inject
 * a deterministic sequence and platform code can back it with a real UUID source.
 */
interface IdempotencyKeyFactory {
    /** Returns a fresh, unique key for a single logical mutating request. */
    fun newKey(): String
}
