package com.ticketinglabs.client.config

/**
 * App configuration. This is the ONE place to point the client at a backend.
 *
 * The app is blind to which backend answers: it only knows this base URL (the API Gateway).
 * Change [DEFAULT_BASE_URL] to target a different gateway.
 *
 * For real devices, prefer an external HTTPS tunnel over a local IP: run `make tunnel` and set
 * this to `https://<subdomain>.ngrok-free.app/api`. See docs/recipes/expose-with-a-tunnel.md.
 * (A local run is `https://localhost/api`; an Android emulator reaches the host at
 * `https://10.0.2.2/api`; a physical phone cannot reach either, hence the tunnel.)
 */
object AppConfig {
    /** The API Gateway base URL. Point this at your tunnel URL for device testing. */
    const val DEFAULT_BASE_URL: String = "https://localhost/api"

    /** How long a reachability probe waits before declaring the server unreachable. */
    const val REACHABILITY_TIMEOUT_MS: Long = 4_000

    /**
     * When false the app runs on in-memory demo data (works with no backend). Set true to
     * consume the real gateway at [DEFAULT_BASE_URL]: real HTTP repositories, a session with
     * refresh rotation, and a login screen gating the flow.
     */
    const val USE_REAL_BACKEND: Boolean = false
}
