package com.ticketinglabs.client.data.http

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.LogLevel
import com.ticketinglabs.client.core.Logger
import com.ticketinglabs.client.core.NoopLogger
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.core.logError
import com.ticketinglabs.client.data.ErrorMapper
import com.ticketinglabs.client.data.dto.ErrorEnvelopeDto
import com.ticketinglabs.client.data.mapper.MappingException
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/**
 * Runs one HTTP request and collapses every possible outcome into an [Outcome].
 *
 * This is the single choke point where the outside world becomes typed:
 *  - a 2xx body is handed to [parse]; if parsing or domain mapping throws, it becomes
 *    [AppError.MalformedResponse] — never a crash.
 *  - a non-2xx status goes to [ErrorMapper], with the error envelope parsed best-effort.
 *  - a request timeout becomes [AppError.Timeout]; any other transport failure becomes
 *    [AppError.NetworkUnavailable].
 *
 * The `X-Request-Id` is lifted from every response and threaded into the error and the log
 * line, so a mobile failure can be correlated with a backend trace. The [client] is
 * injected, so tests drive it with Ktor's MockEngine and no network.
 */
class ApiExecutor(
    private val client: HttpClient,
    private val json: Json,
    private val logger: Logger = NoopLogger,
) {
    /**
     * @param method HTTP method.
     * @param path path relative to the injected base URL, e.g. "events" or "orders/$id".
     * @param query query parameters.
     * @param bodyJson a pre-serialized JSON request body, or null.
     * @param idempotencyKey value for the `Idempotency-Key` header, or null.
     * @param event a stable event name for logging.
     * @param screen the screen the call originates from, for logging.
     * @param parse turns a 2xx body string into the domain type; may throw
     *   [SerializationException] or [MappingException], both of which become
     *   [AppError.MalformedResponse].
     */
    suspend fun <T> execute(
        method: HttpMethod,
        path: String,
        query: Map<String, String> = emptyMap(),
        bodyJson: String? = null,
        idempotencyKey: String? = null,
        event: String,
        screen: String? = null,
        parse: (String) -> T,
    ): Outcome<T> {
        return try {
            val response = client.request(path) {
                this.method = method
                url { query.forEach { (k, v) -> parameters.append(k, v) } }
                idempotencyKey?.let { header("Idempotency-Key", it) }
                if (bodyJson != null) {
                    contentType(ContentType.Application.Json)
                    setBody(bodyJson)
                }
            }
            val requestId = response.headers["X-Request-Id"]
            val bodyText = response.bodyAsText()

            if (response.status.isSuccess()) {
                try {
                    val value = parse(bodyText)
                    logger.log(LogLevel.INFO, event, screen, requestId)
                    Outcome.Success(value)
                } catch (e: SerializationException) {
                    fail(event, screen, AppError.MalformedResponse(requestId, "deserialization: ${e.messageSafe()}"))
                } catch (e: MappingException) {
                    fail(event, screen, AppError.MalformedResponse(requestId, e.messageSafe()))
                }
            } else {
                val envelope = runCatching { json.decodeFromString<ErrorEnvelopeDto>(bodyText) }.getOrNull()
                val retryAfter = response.headers["Retry-After"]?.toIntOrNull()
                fail(event, screen, ErrorMapper.fromStatus(response.status.value, envelope, requestId, retryAfter))
            }
        } catch (e: HttpRequestTimeoutException) {
            fail(event, screen, AppError.Timeout(cause = "request timeout"))
        } catch (e: Exception) {
            // Any other transport-level failure: no response arrived, so no request id.
            fail(event, screen, AppError.NetworkUnavailable(cause = e.messageSafe()))
        }
    }

    private fun fail(event: String, screen: String?, error: AppError): Outcome<Nothing> {
        logger.logError(event, error, screen)
        return Outcome.Failure(error)
    }
}

/** Exception message with no risk of leaking a large or sensitive body into logs. */
private fun Throwable.messageSafe(): String = (message ?: this::class.simpleName ?: "error").take(200)
