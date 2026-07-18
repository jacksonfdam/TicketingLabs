package com.ticketinglabs.client.core

/**
 * What the user can do about an error. The UI turns this into a single, obvious button.
 *
 * Mirrors the `recovery` enum in `/shared/copy/errors.json` so the affordance an app
 * offers matches the copy written for it. One error, one sensible next step.
 */
enum class Recovery {
    /** Try the same operation again. */
    RETRY,

    /** Go back to the previous screen; the current one cannot proceed. */
    BACK,

    /** Refresh the underlying data, then let the user act on the new state. */
    REFRESH,

    /** Send the user to sign in again; the session is gone. */
    SIGN_IN,

    /** Wait before retrying, typically honouring a `Retry-After` hint. */
    WAIT,

    /** Nothing actionable; informational only. */
    NONE,
}
