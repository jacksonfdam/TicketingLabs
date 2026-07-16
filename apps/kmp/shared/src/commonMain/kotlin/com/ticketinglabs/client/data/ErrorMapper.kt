package com.ticketinglabs.client.data

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.data.dto.ErrorEnvelopeDto

/**
 * The one place an HTTP failure becomes a typed [AppError]. Everything else in the app
 * reasons about the taxonomy, not status codes.
 *
 * Mapping is by status first, then refined by the backend `error.code` where it matters
 * (a 409 with `reservation_expired` is still a [AppError.Conflict]; the code is preserved
 * for logs). Unknown codes fall through to the status-based bucket, and an unknown status
 * to [AppError.Unknown] — the app never assumes a shape the backend did not send.
 */
object ErrorMapper {

    /**
     * @param status the HTTP status code.
     * @param envelope the parsed error envelope, or null if the body was absent/unparseable.
     * @param requestId the response's `X-Request-Id`, if present.
     * @param retryAfterSeconds the `Retry-After` header value, if present (for 429).
     */
    fun fromStatus(
        status: Int,
        envelope: ErrorEnvelopeDto?,
        requestId: String?,
        retryAfterSeconds: Int? = null,
    ): AppError {
        val code = envelope?.error?.code
        val rid = requestId ?: envelope?.error?.requestId
        val cause = code?.let { "backend code=$it" }
        return when (status) {
            401 -> AppError.Unauthorized(requestId = rid, cause = cause)
            403 -> AppError.Forbidden(requestId = rid, cause = cause)
            404, 409, 410 -> AppError.Conflict(backendCode = code, requestId = rid, cause = cause)
            422, 400 -> AppError.Validation(requestId = rid, cause = cause)
            429 -> AppError.RateLimited(retryAfterSeconds = retryAfterSeconds, requestId = rid, cause = cause)
            in 500..599 -> AppError.ServerError(httpStatus = status, requestId = rid, cause = cause)
            else -> AppError.Unknown(requestId = rid, cause = cause ?: "unexpected status $status")
        }
    }
}
