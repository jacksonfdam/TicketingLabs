package com.ticketinglabs.client.domain.model

/**
 * A pair of tokens from the auth endpoints. The access token is short-lived and travels on
 * every request; the refresh token is long-lived, rotates on each use, and lives in the
 * platform secure store — never in plain preferences and never in a log.
 *
 * @property accessToken the bearer token attached to requests.
 * @property refreshToken the token exchanged (and rotated) for a new pair.
 * @property expiresInSeconds access-token lifetime, as reported by the server.
 */
data class TokenPair(
    val accessToken: String,
    val refreshToken: String,
    val expiresInSeconds: Int,
)
