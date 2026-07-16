package com.ticketinglabs.client.data.repository

import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.data.dto.CreateOrderDto
import com.ticketinglabs.client.data.dto.CreateReservationDto
import com.ticketinglabs.client.data.dto.EventDetailDto
import com.ticketinglabs.client.data.dto.EventPageDto
import com.ticketinglabs.client.data.dto.OrderDto
import com.ticketinglabs.client.data.dto.QueueTokenDto
import com.ticketinglabs.client.data.dto.ReservationDto
import com.ticketinglabs.client.data.http.ApiExecutor
import com.ticketinglabs.client.data.mapper.toDomain
import com.ticketinglabs.client.domain.model.EventDetail
import com.ticketinglabs.client.domain.model.EventId
import com.ticketinglabs.client.domain.model.EventPage
import com.ticketinglabs.client.domain.model.Order
import com.ticketinglabs.client.domain.model.OrderId
import com.ticketinglabs.client.domain.model.QueueToken
import com.ticketinglabs.client.domain.model.Reservation
import com.ticketinglabs.client.domain.model.ReservationId
import com.ticketinglabs.client.domain.model.SectorId
import com.ticketinglabs.client.domain.port.EventRepository
import com.ticketinglabs.client.domain.port.OrderRepository
import com.ticketinglabs.client.domain.port.QueueRepository
import com.ticketinglabs.client.domain.port.ReservationRepository
import io.ktor.http.HttpMethod
import kotlinx.serialization.json.Json

/**
 * HTTP-backed [EventRepository]. Deserializes the contract's event DTOs and maps them into
 * validated domain models; a malformed page becomes a typed failure, not a crash.
 */
class HttpEventRepository(
    private val api: ApiExecutor,
    private val json: Json,
) : EventRepository {

    override suspend fun listEvents(cursor: String?, limit: Int?): Outcome<EventPage> {
        val query = buildMap {
            cursor?.let { put("cursor", it) }
            limit?.let { put("limit", it.toString()) }
        }
        return api.execute(HttpMethod.Get, "events", query = query, event = "events.list") { text ->
            json.decodeFromString<EventPageDto>(text).toDomain()
        }
    }

    override suspend fun getEvent(id: EventId): Outcome<EventDetail> =
        api.execute(HttpMethod.Get, "events/${id.value}", event = "events.detail") { text ->
            json.decodeFromString<EventDetailDto>(text).toDomain()
        }
}

/** HTTP-backed [QueueRepository] for joining and polling the waiting room. */
class HttpQueueRepository(
    private val api: ApiExecutor,
    private val json: Json,
) : QueueRepository {

    override suspend fun join(eventId: EventId): Outcome<QueueToken> =
        api.execute(HttpMethod.Post, "events/${eventId.value}/queue", event = "queue.join") { text ->
            json.decodeFromString<QueueTokenDto>(text).toDomain()
        }

    override suspend fun status(eventId: EventId): Outcome<QueueToken> =
        api.execute(HttpMethod.Get, "events/${eventId.value}/queue/status", event = "queue.status") { text ->
            json.decodeFromString<QueueTokenDto>(text).toDomain()
        }
}

/** HTTP-backed [ReservationRepository]. Create sends a mandatory `Idempotency-Key`. */
class HttpReservationRepository(
    private val api: ApiExecutor,
    private val json: Json,
) : ReservationRepository {

    override suspend fun create(sectorId: SectorId, quantity: Int, idempotencyKey: String): Outcome<Reservation> {
        val body = json.encodeToString(CreateReservationDto(sectorId.value, quantity))
        return api.execute(
            method = HttpMethod.Post,
            path = "reservations",
            bodyJson = body,
            idempotencyKey = idempotencyKey,
            event = "reservation.create",
        ) { text -> json.decodeFromString<ReservationDto>(text).toDomain() }
    }

    override suspend fun release(id: ReservationId): Outcome<Unit> =
        api.execute(HttpMethod.Delete, "reservations/${id.value}", event = "reservation.release") { }
}

/** HTTP-backed [OrderRepository]. Create sends an `Idempotency-Key` so retries are safe. */
class HttpOrderRepository(
    private val api: ApiExecutor,
    private val json: Json,
) : OrderRepository {

    override suspend fun create(reservationId: ReservationId, idempotencyKey: String): Outcome<Order> {
        val body = json.encodeToString(CreateOrderDto(reservationId.value))
        return api.execute(
            method = HttpMethod.Post,
            path = "orders",
            bodyJson = body,
            idempotencyKey = idempotencyKey,
            event = "order.create",
        ) { text -> json.decodeFromString<OrderDto>(text).toDomain() }
    }

    override suspend fun get(id: OrderId): Outcome<Order> =
        api.execute(HttpMethod.Get, "orders/${id.value}", event = "order.get") { text ->
            json.decodeFromString<OrderDto>(text).toDomain()
        }
}
