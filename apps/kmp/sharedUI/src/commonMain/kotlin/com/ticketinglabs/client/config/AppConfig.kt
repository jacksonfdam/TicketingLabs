package com.ticketinglabs.client.config

/**
 * App configuration. This is the ONE place to point the client at a backend.
 *
 * The app is blind to which backend answers: it only knows this base URL (the API Gateway).
 * Change [DEFAULT_BASE_URL] to target a different gateway. For the backend lab running
 * locally, that is `https://localhost/api`; on an Android emulator use `https://10.0.2.2/api`
 * (the emulator's alias for the host machine).
 */
object AppConfig {
    /** The API Gateway base URL. Change this to point at your backend. */
    const val DEFAULT_BASE_URL: String = "https://localhost/api"

    /** How long a reachability probe waits before declaring the server unreachable. */
    const val REACHABILITY_TIMEOUT_MS: Long = 4_000
}
