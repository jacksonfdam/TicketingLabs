package com.ticketinglabs.client.domain.port

import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.domain.model.TokenPair

/**
 * Authenticates and rotates tokens against the gateway. Both calls are unauthenticated in the
 * bearer sense: login proves identity with credentials, refresh proves it with the refresh
 * token itself.
 */
interface AuthRepository {
    suspend fun login(email: String, password: String): Outcome<TokenPair>

    /** Exchanges [refreshToken] for a new, rotated pair. A failure means the session is over. */
    suspend fun refresh(refreshToken: String): Outcome<TokenPair>
}

/**
 * Persists the token pair. Implementations keep the access token in memory and the refresh
 * token in the platform secure store (Keychain / Keystore). [InMemoryTokenStore] is the
 * test/demo implementation; a secure implementation is a platform actual.
 */
interface TokenStore {
    fun current(): TokenPair?
    fun save(tokens: TokenPair)
    fun clear()
}
