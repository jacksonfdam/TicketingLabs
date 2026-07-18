package com.ticketinglabs.client.config

/**
 * App configuration. This is the ONE place to point the client at a backend.
 *
 * The app is blind to which backend answers: it only knows this base URL (the API Gateway).
 * Change [DEFAULT_BASE_URL] to target a different gateway.
 *
 * Point it at an external HTTPS tunnel — the address a real phone (and the simulator) can reach
 * and trust. Run `make up && make tunnel` (ngrok; Cloudflare Tunnel works too) and set this to
 * `https://<your-tunnel-host>/api`. See docs/recipes/expose-with-a-tunnel.md. Never use a local
 * IP: `https://localhost/api` only works on the same machine and an Android emulator would need
 * `https://10.0.2.2/api` — both dev-only, and a physical phone reaches neither.
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
