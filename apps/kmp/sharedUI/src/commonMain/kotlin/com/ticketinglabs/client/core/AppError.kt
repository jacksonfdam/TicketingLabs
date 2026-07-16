package com.ticketinglabs.client.core

/**
 * The typed error taxonomy. Every failure in the app is one of these, and nothing else.
 *
 * The taxonomy is shared in concept across all three client apps (see
 * `/shared/copy/errors.json`); this is the Kotlin expression of it. Each error carries:
 *  - [code]: a stable taxonomy code, identical to a key under `taxonomy` in the copy map,
 *    so the UI can look up the user-facing title/message.
 *  - [requestId]: the `X-Request-Id` from the response, when there was a response. Null
 *    for transport failures that never reached the server. Logged for correlation.
 *  - [recovery]: what the user can do about it.
 *  - [cause]: a short developer-facing detail for logs. Never shown to users, never PII,
 *    never a token or card number.
 *
 * User-facing wording is deliberately absent here: it lives in `/shared/copy` so all
 * three apps say the same thing. This layer decides *what kind* of error it is; the copy
 * layer decides *how to phrase it*.
 */
sealed interface AppError {
    /** Stable taxonomy code, matching a `taxonomy` key in `/shared/copy/errors.json`. */
    val code: String

    /** Correlation id from the response, or null if the request never reached the server. */
    val requestId: String?

    /** The single recovery affordance the UI should offer. */
    val recovery: Recovery

    /** Short, non-sensitive detail for logs. Not for display. */
    val cause: String?

    /** The device is offline or the connection dropped before a response arrived. */
    data class NetworkUnavailable(
        override val requestId: String? = null,
        override val cause: String? = null,
    ) : AppError {
        override val code get() = "NetworkUnavailable"
        override val recovery get() = Recovery.RETRY
    }

    /** The server did not answer within the deadline. Outcome may be unresolved. */
    data class Timeout(
        override val requestId: String? = null,
        override val cause: String? = null,
    ) : AppError {
        override val code get() = "Timeout"
        override val recovery get() = Recovery.RETRY
    }

    /** Missing or expired credentials. Triggers refresh; on refresh failure, sign-out. */
    data class Unauthorized(
        override val requestId: String? = null,
        override val cause: String? = null,
    ) : AppError {
        override val code get() = "Unauthorized"
        override val recovery get() = Recovery.SIGN_IN
    }

    /** Authenticated but not permitted. */
    data class Forbidden(
        override val requestId: String? = null,
        override val cause: String? = null,
    ) : AppError {
        override val code get() = "Forbidden"
        override val recovery get() = Recovery.BACK
    }

    /**
     * Too many requests. [retryAfterSeconds] carries the server's `Retry-After` hint when
     * present, so the app can back off polling by exactly as long as it was told.
     */
    data class RateLimited(
        val retryAfterSeconds: Int? = null,
        override val requestId: String? = null,
        override val cause: String? = null,
    ) : AppError {
        override val code get() = "RateLimited"
        override val recovery get() = Recovery.WAIT
    }

    /**
     * The resource is gone or has changed under the user: sold out, inventory exhausted,
     * reservation expired. [backendCode] preserves the original `error.code` for logs.
     */
    data class Conflict(
        val backendCode: String? = null,
        override val requestId: String? = null,
        override val cause: String? = null,
    ) : AppError {
        override val code get() = "Conflict"
        override val recovery get() = Recovery.REFRESH
    }

    /** Input failed server-side validation. */
    data class Validation(
        override val requestId: String? = null,
        override val cause: String? = null,
    ) : AppError {
        override val code get() = "Validation"
        override val recovery get() = Recovery.BACK
    }

    /** The server broke (5xx). Not the user's fault; retry is reasonable. */
    data class ServerError(
        val httpStatus: Int? = null,
        override val requestId: String? = null,
        override val cause: String? = null,
    ) : AppError {
        override val code get() = "ServerError"
        override val recovery get() = Recovery.RETRY
    }

    /**
     * The response could not be validated against the contract: a missing required field,
     * a wrong type, an unparseable body. The zero-trust case. We stop rather than proceed
     * on data we could not read, and we never crash on it.
     */
    data class MalformedResponse(
        override val requestId: String? = null,
        override val cause: String? = null,
    ) : AppError {
        override val code get() = "MalformedResponse"
        override val recovery get() = Recovery.RETRY
    }

    /** The payment was declined outright. A definite, final "no". */
    data class PaymentDeclined(
        override val requestId: String? = null,
        override val cause: String? = null,
    ) : AppError {
        override val code get() = "PaymentDeclined"
        override val recovery get() = Recovery.BACK
    }

    /**
     * The payment outcome is genuinely unknown: the gateway timed out or the connection
     * dropped mid-request. The app must NOT assume failure and must NOT charge again. It
     * reconciles by polling. This is the most important error in the taxonomy.
     */
    data class PaymentUnknown(
        override val requestId: String? = null,
        override val cause: String? = null,
    ) : AppError {
        override val code get() = "PaymentUnknown"
        override val recovery get() = Recovery.WAIT
    }

    /** Anything that did not match a known case. The honest fallback. */
    data class Unknown(
        override val requestId: String? = null,
        override val cause: String? = null,
    ) : AppError {
        override val code get() = "Unknown"
        override val recovery get() = Recovery.RETRY
    }
}
