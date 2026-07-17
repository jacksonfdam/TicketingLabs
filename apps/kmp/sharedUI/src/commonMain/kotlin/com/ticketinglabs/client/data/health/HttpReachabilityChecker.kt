package com.ticketinglabs.client.data.health

import com.ticketinglabs.client.domain.port.ReachabilityChecker
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException

/**
 * Reachability via a short, timed GET on the gateway's `/health`. The client uses whatever
 * engine is on the classpath (OkHttp on Android, Darwin on iOS) — no engine is passed, so
 * this needs no platform wiring.
 *
 * The timeout is deliberately short so the connectivity check resolves quickly; a slow or
 * dead server becomes "unreachable" rather than a spinner that never ends.
 *
 * @property baseUrl the gateway base URL.
 * @property timeoutMs how long to wait before giving up.
 */
class HttpReachabilityChecker(
    private val baseUrl: String,
    private val timeoutMs: Long = 4_000,
) : ReachabilityChecker {

    private val client = HttpClient {
        expectSuccess = false
        install(HttpTimeout) {
            requestTimeoutMillis = timeoutMs
            connectTimeoutMillis = timeoutMs
        }
    }

    override suspend fun isServerReachable(): Boolean {
        val base = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        return try {
            client.get("${base}health").status.isSuccess()
        } catch (e: CancellationException) {
            throw e // never swallow coroutine cancellation
        } catch (_: Throwable) {
            false // no connection, refused, timed out, TLS error: all mean "not reachable now"
        }
    }
}
