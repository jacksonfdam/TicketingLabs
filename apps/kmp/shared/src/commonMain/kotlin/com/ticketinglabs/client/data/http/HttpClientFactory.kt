package com.ticketinglabs.client.data.http

import com.ticketinglabs.client.data.ApiConfig
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpRequestRetry
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.url
import kotlinx.serialization.json.Json

/**
 * Builds the one HttpClient the app uses, with every cross-cutting concern configured in a
 * single place: the injected base URL, request/connect timeouts, and retry with backoff.
 *
 * The [engine] is injected — platform code supplies the real one (Darwin/OkHttp/CIO); tests
 * supply Ktor's MockEngine. The factory itself is platform-agnostic and lives in
 * `commonMain`, which is the point.
 *
 * Retry is safe because every mutating request carries a client-generated `Idempotency-Key`
 * (see the reservation and order use cases), so a retried POST cannot double-book.
 *
 * Not yet wired here: bearer-token attachment and refresh rotation. That is the next
 * increment; it belongs in this factory as an Auth plugin backed by the secure token store.
 */
object HttpClientFactory {

    /** The defensive JSON configuration: ignore unknown fields, tolerate absent nullables. */
    fun defaultJson(): Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    /**
     * @param engine the platform HTTP engine (or MockEngine in tests).
     * @param config the base URL and timeouts; the only thing the app knows about the backend.
     */
    fun create(engine: HttpClientEngine, config: ApiConfig): HttpClient {
        val base = if (config.baseUrl.endsWith("/")) config.baseUrl else config.baseUrl + "/"
        return HttpClient(engine) {
            expectSuccess = false // the executor inspects status itself; no thrown 4xx/5xx
            defaultRequest { url(base) }
            install(HttpTimeout) {
                requestTimeoutMillis = config.requestTimeoutMs
                connectTimeoutMillis = config.connectTimeoutMs
            }
            install(HttpRequestRetry) {
                maxRetries = config.maxRetries
                retryOnServerErrors(maxRetries)
                retryOnException(maxRetries, retryOnTimeout = true)
                exponentialDelay()
            }
        }
    }
}
