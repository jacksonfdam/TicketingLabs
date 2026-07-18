package com.ticketinglabs.client.data.auth

import com.ticketinglabs.client.domain.model.TokenPair
import com.ticketinglabs.client.domain.port.TokenStore

/**
 * Holds the token pair in memory. Correct for the demo and for tests; a production build backs
 * the refresh token with the platform secure store (Keychain on iOS, EncryptedSharedPreferences
 * / Keystore on Android) behind this same [TokenStore] port, so nothing above the port changes.
 */
class InMemoryTokenStore(initial: TokenPair? = null) : TokenStore {
    private var tokens: TokenPair? = initial
    override fun current(): TokenPair? = tokens
    override fun save(tokens: TokenPair) { this.tokens = tokens }
    override fun clear() { tokens = null }
}
