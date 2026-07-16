package com.ticketinglabs.client.core

/** Severity of a log line. */
enum class LogLevel { DEBUG, INFO, WARN, ERROR }

/**
 * A structured, PII-safe logging facade.
 *
 * One interface, injected everywhere, so there is a single place that decides how logs are
 * emitted per platform. Fields are structured (not a formatted string) so a log line can be
 * correlated with a backend trace via [requestId], which mirrors the response's
 * `X-Request-Id`.
 *
 * Never pass tokens, card data, full auth headers or other PII into any field. The
 * taxonomy's [AppError.cause] is written to be safe to log; raw response bodies are not.
 */
interface Logger {
    /**
     * @param level severity.
     * @param event a short, stable event name, e.g. "order.poll" or "reservation.create".
     * @param screen the screen the event happened on, if any.
     * @param requestId the response correlation id, if any.
     * @param errorCode the taxonomy [AppError.code], if this line is about a failure.
     * @param latencyMs how long the operation took, if measured.
     * @param extra any additional non-sensitive key/values.
     */
    fun log(
        level: LogLevel,
        event: String,
        screen: String? = null,
        requestId: String? = null,
        errorCode: String? = null,
        latencyMs: Long? = null,
        extra: Map<String, String> = emptyMap(),
    )
}

/** Logs an [AppError] at [LogLevel.ERROR], pulling its code and request id into the line. */
fun Logger.logError(event: String, error: AppError, screen: String? = null, latencyMs: Long? = null) {
    log(
        level = LogLevel.ERROR,
        event = event,
        screen = screen,
        requestId = error.requestId,
        errorCode = error.code,
        latencyMs = latencyMs,
        extra = error.cause?.let { mapOf("cause" to it) } ?: emptyMap(),
    )
}

/** A logger that drops everything. The default until a platform installs a real one. */
object NoopLogger : Logger {
    override fun log(
        level: LogLevel,
        event: String,
        screen: String?,
        requestId: String?,
        errorCode: String?,
        latencyMs: Long?,
        extra: Map<String, String>,
    ) = Unit
}
