package com.ticketinglabs.client.data

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.data.auth.InMemoryTokenStore
import com.ticketinglabs.client.data.auth.SessionManager
import com.ticketinglabs.client.data.http.ApiExecutor
import com.ticketinglabs.client.data.http.HttpClientFactory
import com.ticketinglabs.client.data.repository.HttpAuthRepository
import com.ticketinglabs.client.domain.model.TokenPair
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * The refresh-rotation contract: an expired access token is refreshed (and rotated) once and
 * the request retried; a failed refresh signs the session out. Driven with Ktor's MockEngine.
 */
class AuthSessionTest {

    private fun tokenJson(access: String, refresh: String) =
        """{"access_token":"$access","refresh_token":"$refresh","token_type":"Bearer","expires_in":900}"""

    // Real time (not runTest's virtual clock) so the client's HttpTimeout does not spuriously fire.
    private fun authTest(block: suspend () -> Unit) = runTest { withContext(Dispatchers.Default) { block() } }

    @Test
    fun an_expired_access_token_is_refreshed_rotated_and_the_request_retried() = authTest {
        val json = HttpClientFactory.defaultJson()
        val engine = MockEngine { request ->
            when {
                request.url.encodedPath.endsWith("/auth/refresh") ->
                    respond(tokenJson("new-access", "new-refresh"), HttpStatusCode.OK, headersOf("X-Request-Id", "r1"))
                request.headers["Authorization"] == "Bearer new-access" ->
                    respond("""{"ok":true}""", HttpStatusCode.OK, headersOf("X-Request-Id", "r2"))
                else ->
                    respond(
                        """{"error":{"code":"unauthorized","message":"expired","request_id":"r0"}}""",
                        HttpStatusCode.Unauthorized,
                    )
            }
        }
        val client = HttpClientFactory.create(engine, ApiConfig("https://localhost/api"))
        val store = InMemoryTokenStore(TokenPair("old-access", "old-refresh", 900))
        val session = SessionManager(store, HttpAuthRepository(ApiExecutor(client, json), json))
        val protected = ApiExecutor(client, json, session = session)

        val result = protected.execute(HttpMethod.Get, "orders/o1", event = "order.get", parse = { it })

        assertIs<Outcome.Success<*>>(result)
        assertEquals("new-refresh", store.current()?.refreshToken) // rotated
        assertEquals("new-access", store.current()?.accessToken)
        assertEquals(false, session.signedOut.value)
    }

    @Test
    fun a_failed_refresh_signs_the_session_out() = authTest {
        val json = HttpClientFactory.defaultJson()
        val engine = MockEngine { request ->
            when {
                request.url.encodedPath.endsWith("/auth/refresh") ->
                    respond(
                        """{"error":{"code":"unauthorized","message":"revoked","request_id":"r0"}}""",
                        HttpStatusCode.Unauthorized,
                    )
                else ->
                    respond(
                        """{"error":{"code":"unauthorized","message":"expired","request_id":"r0"}}""",
                        HttpStatusCode.Unauthorized,
                    )
            }
        }
        val client = HttpClientFactory.create(engine, ApiConfig("https://localhost/api"))
        val store = InMemoryTokenStore(TokenPair("old-access", "old-refresh", 900))
        val session = SessionManager(store, HttpAuthRepository(ApiExecutor(client, json), json))
        val protected = ApiExecutor(client, json, session = session)

        val result = protected.execute(HttpMethod.Get, "orders/o1", event = "order.get", parse = { it })

        assertIs<Outcome.Failure>(result)
        assertIs<AppError.Unauthorized>(result.error)
        assertEquals(true, session.signedOut.value)
        assertEquals(null, store.current())
    }
}
