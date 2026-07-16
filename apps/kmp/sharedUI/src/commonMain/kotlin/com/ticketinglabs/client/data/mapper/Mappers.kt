@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.ticketinglabs.client.data.mapper

import com.ticketinglabs.client.data.dto.EventDetailDto
import com.ticketinglabs.client.data.dto.EventDto
import com.ticketinglabs.client.data.dto.EventPageDto
import com.ticketinglabs.client.data.dto.OrderDto
import com.ticketinglabs.client.data.dto.QueueTokenDto
import com.ticketinglabs.client.data.dto.ReservationDto
import com.ticketinglabs.client.data.dto.SectorDto
import com.ticketinglabs.client.domain.model.Event
import com.ticketinglabs.client.domain.model.EventDetail
import com.ticketinglabs.client.domain.model.EventId
import com.ticketinglabs.client.domain.model.EventPage
import com.ticketinglabs.client.domain.model.EventStatus
import com.ticketinglabs.client.domain.model.Money
import com.ticketinglabs.client.domain.model.Order
import com.ticketinglabs.client.domain.model.OrderId
import com.ticketinglabs.client.domain.model.OrderStatus
import com.ticketinglabs.client.domain.model.QueueStatus
import com.ticketinglabs.client.domain.model.QueueToken
import com.ticketinglabs.client.domain.model.QueueTokenId
import com.ticketinglabs.client.domain.model.Reservation
import com.ticketinglabs.client.domain.model.ReservationId
import com.ticketinglabs.client.domain.model.ReservationStatus
import com.ticketinglabs.client.domain.model.Sector
import com.ticketinglabs.client.domain.model.SectorId
import com.ticketinglabs.client.domain.model.Timestamp
import com.ticketinglabs.client.domain.model.UserId
import kotlin.time.Instant

/**
 * Thrown when a DTO cannot be turned into a valid domain model: an unrecognised enum value,
 * an unparseable timestamp, or a value that violates a domain invariant. The HTTP adapter
 * catches this and returns [com.ticketinglabs.client.core.AppError.MalformedResponse]. It
 * carries no response body, only a short reason, so it is safe to log.
 */
class MappingException(reason: String) : Exception(reason)

private fun parseTimestamp(value: String): Timestamp = try {
    Timestamp(Instant.parse(value).toEpochMilliseconds())
} catch (e: IllegalArgumentException) {
    throw MappingException("unparseable timestamp '$value'")
}

private fun eventStatus(raw: String): EventStatus = when (raw) {
    "draft" -> EventStatus.DRAFT
    "on_sale" -> EventStatus.ON_SALE
    "sold_out" -> EventStatus.SOLD_OUT
    "closed" -> EventStatus.CLOSED
    else -> throw MappingException("unknown event status '$raw'")
}

private fun queueStatus(raw: String): QueueStatus = when (raw) {
    "waiting" -> QueueStatus.WAITING
    "admitted" -> QueueStatus.ADMITTED
    "expired" -> QueueStatus.EXPIRED
    else -> throw MappingException("unknown queue status '$raw'")
}

private fun reservationStatus(raw: String): ReservationStatus = when (raw) {
    "held" -> ReservationStatus.HELD
    "confirmed" -> ReservationStatus.CONFIRMED
    "released" -> ReservationStatus.RELEASED
    "expired" -> ReservationStatus.EXPIRED
    else -> throw MappingException("unknown reservation status '$raw'")
}

private fun orderStatus(raw: String): OrderStatus = when (raw) {
    "pending" -> OrderStatus.PENDING
    "paid" -> OrderStatus.PAID
    "failed" -> OrderStatus.FAILED
    "refunded" -> OrderStatus.REFUNDED
    else -> throw MappingException("unknown order status '$raw'")
}

/** Wraps domain-invariant failures (e.g. [Money], [Sector]) as [MappingException]. */
private inline fun <T> guarded(block: () -> T): T = try {
    block()
} catch (e: IllegalArgumentException) {
    throw MappingException(e.message ?: "domain invariant violated")
}

fun EventDto.toDomain(): Event = guarded {
    Event(
        id = EventId(id),
        name = name,
        venue = venue,
        startsAt = parseTimestamp(startsAt),
        salesOpenAt = parseTimestamp(salesOpenAt),
        status = eventStatus(status),
    )
}

fun SectorDto.toDomain(): Sector = guarded {
    Sector(
        id = SectorId(id),
        eventId = EventId(eventId),
        name = name,
        price = Money(priceCents, currency),
        totalInventory = totalInventory,
        availableInventory = availableInventory,
    )
}

fun EventDetailDto.toDomain(): EventDetail = guarded {
    EventDetail(
        event = Event(
            id = EventId(id),
            name = name,
            venue = venue,
            startsAt = parseTimestamp(startsAt),
            salesOpenAt = parseTimestamp(salesOpenAt),
            status = eventStatus(status),
        ),
        sectors = sectors.map { it.toDomain() },
    )
}

fun EventPageDto.toDomain(): EventPage = guarded {
    EventPage(events = data.map { it.toDomain() }, nextCursor = nextCursor)
}

fun QueueTokenDto.toDomain(): QueueToken = guarded {
    QueueToken(
        id = QueueTokenId(id),
        userId = UserId(userId),
        eventId = EventId(eventId),
        position = position,
        status = queueStatus(status),
        admittedAt = admittedAt?.let { parseTimestamp(it) },
    )
}

fun ReservationDto.toDomain(): Reservation = guarded {
    Reservation(
        id = ReservationId(id),
        userId = UserId(userId),
        sectorId = SectorId(sectorId),
        quantity = quantity,
        status = reservationStatus(status),
        expiresAt = parseTimestamp(expiresAt),
    )
}

fun OrderDto.toDomain(): Order = guarded {
    Order(
        id = OrderId(id),
        reservationId = ReservationId(reservationId),
        userId = UserId(userId),
        amountCents = amountCents,
        status = orderStatus(status),
        createdAt = parseTimestamp(createdAt),
    )
}
