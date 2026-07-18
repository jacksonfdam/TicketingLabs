package com.ticketinglabs.client.di

import com.ticketinglabs.client.data.ApiConfig
import com.ticketinglabs.client.data.auth.SessionManager
import com.ticketinglabs.client.data.auth.createSecureTokenStore
import com.ticketinglabs.client.data.cache.CachingEventRepository
import com.ticketinglabs.client.data.http.ApiExecutor
import com.ticketinglabs.client.data.http.HttpClientFactory
import com.ticketinglabs.client.data.repository.HttpAuthRepository
import com.ticketinglabs.client.data.repository.HttpEventRepository
import com.ticketinglabs.client.data.repository.HttpOrderRepository
import com.ticketinglabs.client.data.repository.HttpQueueRepository
import com.ticketinglabs.client.data.repository.HttpReservationRepository
import com.ticketinglabs.client.demo.DemoEventRepository
import com.ticketinglabs.client.demo.DemoIdempotencyKeyFactory
import com.ticketinglabs.client.demo.DemoOrderRepository
import com.ticketinglabs.client.demo.DemoQueueRepository
import com.ticketinglabs.client.demo.DemoReservationRepository
import com.ticketinglabs.client.domain.port.IdempotencyKeyFactory
import com.ticketinglabs.client.domain.port.OrderRepository
import com.ticketinglabs.client.domain.port.QueueRepository
import com.ticketinglabs.client.domain.port.ReservationRepository
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * The composition root's dependency graph. [session] is null in demo mode (no auth); the app
 * shows the login screen only when a real [SessionManager] is present and has no token.
 */
class Backend(
    val events: CachingEventRepository,
    val queue: QueueRepository,
    val reservations: ReservationRepository,
    val orders: OrderRepository,
    val keys: IdempotencyKeyFactory,
    val session: SessionManager?,
)

/** In-memory data, no auth. Runs with no backend. */
fun demoBackend(): Backend = Backend(
    events = CachingEventRepository(DemoEventRepository()),
    queue = DemoQueueRepository(),
    reservations = DemoReservationRepository(),
    orders = DemoOrderRepository(),
    keys = DemoIdempotencyKeyFactory(),
    session = null,
)

/** Real HTTP repositories against the gateway, with a session and refresh rotation. */
fun realBackend(config: ApiConfig): Backend {
    val json = HttpClientFactory.defaultJson()
    // Auth calls go through a session-less executor so refresh does not carry a stale token.
    val authExecutor = ApiExecutor(HttpClientFactory.createDefault(config), json)
    val session = SessionManager(createSecureTokenStore(), HttpAuthRepository(authExecutor, json))
    val executor = ApiExecutor(HttpClientFactory.createDefault(config), json, session = session)
    return Backend(
        events = CachingEventRepository(HttpEventRepository(executor, json)),
        queue = HttpQueueRepository(executor, json),
        reservations = HttpReservationRepository(executor, json),
        orders = HttpOrderRepository(executor, json),
        keys = UuidKeyFactory(),
        session = session,
    )
}

@OptIn(ExperimentalUuidApi::class)
private class UuidKeyFactory : IdempotencyKeyFactory {
    override fun newKey(): String = Uuid.random().toString()
}
