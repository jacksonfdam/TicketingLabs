package com.ticketinglabs.client.domain

import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.domain.model.Order
import com.ticketinglabs.client.domain.model.OrderId
import com.ticketinglabs.client.domain.model.OrderStatus
import com.ticketinglabs.client.domain.model.Reservation
import com.ticketinglabs.client.domain.model.ReservationId
import com.ticketinglabs.client.domain.model.ReservationStatus
import com.ticketinglabs.client.domain.model.SectorId
import com.ticketinglabs.client.domain.model.Timestamp
import com.ticketinglabs.client.domain.model.UserId
import com.ticketinglabs.client.domain.port.OrderRepository
import com.ticketinglabs.client.domain.port.ReservationRepository

/**
 * In-memory test doubles. Use cases depend on ports, so tests inject these and run with
 * no network, no coroutine dispatcher games, and no flakiness.
 */

/** A reservation repo that records the idempotency keys it was handed. */
class FakeReservationRepo(
    private val answer: (String) -> Outcome<Reservation> = { Outcome.Success(sampleReservation()) },
) : ReservationRepository {
    val keysSeen = mutableListOf<String>()

    override suspend fun create(sectorId: SectorId, quantity: Int, idempotencyKey: String): Outcome<Reservation> {
        keysSeen += idempotencyKey
        return answer(idempotencyKey)
    }

    override suspend fun release(id: ReservationId): Outcome<Unit> = Outcome.Success(Unit)
}

/** An order repo whose create/get answer is scripted per test. */
class FakeOrderRepo(
    private val onCreate: () -> Outcome<Order> = { Outcome.Success(order(OrderStatus.PENDING)) },
    private val onGet: () -> Outcome<Order> = onCreate,
) : OrderRepository {
    var createCalls = 0

    override suspend fun create(reservationId: ReservationId, idempotencyKey: String): Outcome<Order> {
        createCalls++
        return onCreate()
    }

    override suspend fun get(id: OrderId): Outcome<Order> = onGet()
}

fun sampleReservation(): Reservation = Reservation(
    id = ReservationId("r1"),
    userId = UserId("u1"),
    sectorId = SectorId("s1"),
    quantity = 2,
    status = ReservationStatus.HELD,
    expiresAt = Timestamp(0),
)

fun order(status: OrderStatus): Order = Order(
    id = OrderId("o1"),
    reservationId = ReservationId("r1"),
    userId = UserId("u1"),
    amountCents = 1000,
    status = status,
    createdAt = Timestamp(0),
)
