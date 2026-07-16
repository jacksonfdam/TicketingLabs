package com.ticketinglabs.client.ui

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Recovery

/** A resolved, user-facing rendering of an error: what to say and what the button does. */
data class ErrorCopy(val title: String, val message: String, val actionLabel: String?)

/**
 * The error-code → message map, mirrored from `/shared/copy/errors.json` so all three apps
 * say the same thing. Keyed by the taxonomy [AppError.code]. This is the KMP consumer of the
 * shared copy artifact.
 */
object Copy {
    private val byCode: Map<String, Pair<String, String>> = mapOf(
        "NetworkUnavailable" to ("No connection" to "You appear to be offline. Check your connection and try again."),
        "Timeout" to ("Taking too long" to "The server did not answer in time. It may still be working."),
        "Unauthorized" to ("Signed out" to "Your session has ended. Sign in again to continue."),
        "Forbidden" to ("Not allowed" to "You do not have access to this."),
        "RateLimited" to ("Slow down" to "Too many requests. Wait a moment before trying again."),
        "Conflict" to ("No longer available" to "That is gone or has changed. Refresh and pick again."),
        "Validation" to ("Check your details" to "Some of what you entered was not accepted."),
        "ServerError" to ("Something broke" to "The server had a problem. This is not your fault."),
        "MalformedResponse" to ("Unexpected response" to "We received something we could not read and stopped to be safe."),
        "PaymentDeclined" to ("Payment declined" to "Your payment was declined. Try a different method."),
        "PaymentUnknown" to ("Confirming payment" to "We are checking with the payment provider. Do not pay again."),
        "Unknown" to ("Something went wrong" to "An unexpected error occurred."),
    )

    fun of(error: AppError): ErrorCopy {
        val (title, message) = byCode[error.code] ?: byCode.getValue("Unknown")
        return ErrorCopy(title, message, actionLabel(error.recovery))
    }

    private fun actionLabel(recovery: Recovery): String? = when (recovery) {
        Recovery.RETRY -> "Try again"
        Recovery.BACK -> "Go back"
        Recovery.REFRESH -> "Refresh"
        Recovery.SIGN_IN -> "Sign in"
        Recovery.WAIT -> "Keep waiting"
        Recovery.NONE -> null
    }
}
