package com.ticketinglabs.client.demo

import com.ticketinglabs.client.core.Outcome
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
import com.ticketinglabs.client.domain.port.EventRepository
import com.ticketinglabs.client.domain.port.IdempotencyKeyFactory
import com.ticketinglabs.client.domain.port.OrderRepository
import com.ticketinglabs.client.domain.port.QueueRepository
import com.ticketinglabs.client.domain.port.ReservationRepository
import kotlinx.coroutines.delay

/**
 * In-memory repositories that act like a well-behaved backend, so the desktop demo runs the
 * whole flow with no server. They add small delays to make the async states visible: the
 * queue admits after a couple of polls, the order settles from pending to paid. This is a
 * demo aid, not production code — the real adapters are the Http* repositories in :shared.
 */

val demoEvents = listOf(
    Event(EventId("e1"), "Skyline Festival", "Riverside Park", Timestamp(0), Timestamp(0), EventStatus.ON_SALE),
    Event(EventId("e2"), "Midnight Orchestra", "Grand Hall", Timestamp(0), Timestamp(0), EventStatus.ON_SALE),
    Event(EventId("e3"), "Last Year's Reunion", "The Old Venue", Timestamp(0), Timestamp(0), EventStatus.SOLD_OUT),
)

private fun demoDetail(id: EventId) = EventDetail(
    event = demoEvents.firstOrNull { it.id == id } ?: demoEvents.first(),
    sectors = listOf(
        Sector(SectorId("s1"), id, "Front stage", Money(9500, "GBP"), 100, 12),
        Sector(SectorId("s2"), id, "Stands", Money(5500, "GBP"), 500, 240),
        Sector(SectorId("s3"), id, "Restricted view", Money(2500, "GBP"), 50, 0),
    ),
)

class DemoEventRepository : EventRepository {
    override suspend fun listEvents(cursor: String?, limit: Int?): Outcome<EventPage> {
        delay(300)
        return Outcome.Success(EventPage(demoEvents, null))
    }

    override suspend fun getEvent(id: EventId): Outcome<EventDetail> {
        delay(200)
        return Outcome.Success(demoDetail(id))
    }
}

class DemoQueueRepository : QueueRepository {
    private var polls = 0
    override suspend fun join(eventId: EventId): Outcome<QueueToken> {
        delay(300)
        return Outcome.Success(QueueToken(QueueTokenId("q1"), UserId("u1"), eventId, 3, QueueStatus.WAITING, null))
    }

    override suspend fun status(eventId: EventId): Outcome<QueueToken> {
        polls++
        return if (polls >= 3) {
            Outcome.Success(QueueToken(QueueTokenId("q1"), UserId("u1"), eventId, 0, QueueStatus.ADMITTED, Timestamp(0)))
        } else {
            Outcome.Success(QueueToken(QueueTokenId("q1"), UserId("u1"), eventId, 3 - polls, QueueStatus.WAITING, null))
        }
    }
}

class DemoReservationRepository : ReservationRepository {
    override suspend fun create(sectorId: SectorId, quantity: Int, idempotencyKey: String): Outcome<Reservation> {
        delay(300)
        return Outcome.Success(
            Reservation(ReservationId("r1"), UserId("u1"), sectorId, quantity, ReservationStatus.HELD, Timestamp(0)),
        )
    }

    override suspend fun release(id: ReservationId): Outcome<Unit> = Outcome.Success(Unit)
}

class DemoOrderRepository : OrderRepository {
    private var polls = 0
    override suspend fun create(reservationId: ReservationId, idempotencyKey: String): Outcome<Order> {
        delay(400)
        return Outcome.Success(Order(OrderId("o1"), reservationId, UserId("u1"), 9500, OrderStatus.PENDING, Timestamp(0)))
    }

    override suspend fun get(id: OrderId): Outcome<Order> {
        polls++
        val status = if (polls >= 3) OrderStatus.PAID else OrderStatus.PENDING
        return Outcome.Success(Order(id, ReservationId("r1"), UserId("u1"), 9500, status, Timestamp(0)))
    }
}

/** A simple counter-backed key factory. Real apps use a UUID source per platform. */
class DemoIdempotencyKeyFactory : IdempotencyKeyFactory {
    private var n = 0
    override fun newKey(): String = "demo-idem-${n++}"
}
