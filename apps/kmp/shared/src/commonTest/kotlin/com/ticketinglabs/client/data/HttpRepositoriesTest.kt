package com.ticketinglabs.client.data

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.data.http.ApiExecutor
import com.ticketinglabs.client.data.http.HttpClientFactory
import com.ticketinglabs.client.data.repository.HttpEventRepository
import com.ticketinglabs.client.data.repository.HttpOrderRepository
import com.ticketinglabs.client.data.repository.HttpReservationRepository
import com.ticketinglabs.client.domain.model.EventId
import com.ticketinglabs.client.domain.model.EventStatus
import com.ticketinglabs.client.domain.model.OrderId
import com.ticketinglabs.client.domain.model.SectorId
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Exercises the HTTP data layer against Ktor's MockEngine: defensive deserialization, error
 * mapping, request-id propagation and the idempotency header. No network, fully headless.
 * Scenarios: `malformed-response`, `sold-out-conflict`, `token-expired`, `reservation-create`.
 */
class HttpRepositoriesTest {

    private class Api(handler: suspend MockRequestHandleScope.(HttpRequestData) -> HttpResponseData) {
        val json = HttpClientFactory.defaultJson()
        private val client = HttpClientFactory.create(MockEngine(handler), ApiConfig("https://localhost/api"))
        private val executor = ApiExecutor(client, json)
        val events = HttpEventRepository(executor, json)
        val reservations = HttpReservationRepository(executor, json)
        val orders = HttpOrderRepository(executor, json)
    }

    @Test
    fun events_list_parses_and_ignores_unknown_fields() = runTest {
        // Note the extra "surprise" field the contract never mentioned: it must be ignored.
        val body = """
            {"data":[{"id":"e1","name":"Show","venue":"O2","starts_at":"2026-08-01T20:00:00Z",
            "sales_open_at":"2026-07-20T10:00:00Z","status":"on_sale","surprise":"ignore me"}],
            "next_cursor":null}
        """.trimIndent()
        val api = Api { respond(body, HttpStatusCode.OK, headersOf("X-Request-Id", "req-1")) }

        val result = api.events.listEvents(cursor = null, limit = null)

        assertIs<Outcome.Success<*>>(result)
        val page = (result as Outcome.Success).value
        assertEquals(1, page.events.size)
        assertEquals("Show", page.events.first().name)
        assertEquals(EventStatus.ON_SALE, page.events.first().status)
        assertEquals(null, page.nextCursor)
    }

    @Test
    fun an_unknown_enum_value_becomes_MalformedResponse() = runTest {
        val body = """
            {"id":"e1","name":"Show","venue":"O2","starts_at":"2026-08-01T20:00:00Z",
            "sales_open_at":"2026-07-20T10:00:00Z","status":"on_fire","sectors":[]}
        """.trimIndent()
        val api = Api { respond(body, HttpStatusCode.OK) }

        val result = api.events.getEvent(EventId("e1"))

        assertIs<Outcome.Failure>(result)
        assertIs<AppError.MalformedResponse>(result.error)
    }

    @Test
    fun an_unparseable_timestamp_becomes_MalformedResponse() = runTest {
        val body = """
            {"id":"e1","name":"Show","venue":"O2","starts_at":"not-a-date",
            "sales_open_at":"2026-07-20T10:00:00Z","status":"on_sale","sectors":[]}
        """.trimIndent()
        val api = Api { respond(body, HttpStatusCode.OK) }

        assertIs<AppError.MalformedResponse>((api.events.getEvent(EventId("e1")) as Outcome.Failure).error)
    }

    @Test
    fun garbage_body_becomes_MalformedResponse() = runTest {
        val api = Api { respond("{ not json", HttpStatusCode.OK) }
        assertIs<AppError.MalformedResponse>((api.events.getEvent(EventId("e1")) as Outcome.Failure).error)
    }

    @Test
    fun a_409_with_a_backend_code_maps_to_Conflict_and_keeps_the_request_id() = runTest {
        val body = """{"error":{"code":"inventory_exhausted","message":"gone","request_id":"req-9"}}"""
        val api = Api { respond(body, HttpStatusCode.Conflict, headersOf("X-Request-Id", "req-9")) }

        val result = api.reservations.create(SectorId("s1"), 2, "key-1")

        assertIs<Outcome.Failure>(result)
        val error = result.error
        assertIs<AppError.Conflict>(error)
        assertEquals("inventory_exhausted", error.backendCode)
        assertEquals("req-9", error.requestId)
    }

    @Test
    fun reservation_create_sends_the_idempotency_key_and_body() = runTest {
        var seenKey: String? = null
        var seenBody: String? = null
        val api = Api { request ->
            seenKey = request.headers["Idempotency-Key"]
            seenBody = (request.body as? TextContent)?.text
            respond(
                """{"id":"r1","user_id":"u1","sector_id":"s1","quantity":2,"status":"held","expires_at":"2026-07-20T10:05:00Z"}""",
                HttpStatusCode.Created,
                headersOf("X-Request-Id", "req-2"),
            )
        }

        val result = api.reservations.create(SectorId("s1"), 2, "idem-42")

        assertIs<Outcome.Success<*>>(result)
        assertEquals("idem-42", seenKey)
        assertTrue(seenBody?.contains("\"sector_id\":\"s1\"") == true, "body should carry sector_id, was $seenBody")
    }

    @Test
    fun a_401_maps_to_Unauthorized() = runTest {
        val body = """{"error":{"code":"unauthorized","message":"no","request_id":"req-3"}}"""
        val api = Api { respond(body, HttpStatusCode.Unauthorized, headersOf("X-Request-Id", "req-3")) }

        val result = api.orders.get(OrderId("o1"))

        assertIs<Outcome.Failure>(result)
        assertIs<AppError.Unauthorized>(result.error)
        assertEquals("req-3", result.error.requestId)
    }
}
