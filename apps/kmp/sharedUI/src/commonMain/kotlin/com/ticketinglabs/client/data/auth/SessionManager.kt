package com.ticketinglabs.client.data.auth

import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.domain.model.TokenPair
import com.ticketinglabs.client.domain.port.AuthRepository
import com.ticketinglabs.client.domain.port.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Owns the session: the current tokens, login, and the refresh-with-rotation the HTTP layer
 * calls on a 401. One refresh happens at a time (a [Mutex] prevents a stampede when several
 * requests 401 at once), and a failed refresh is terminal — the session is cleared and
 * [signedOut] flips, so the app can bounce to sign-in exactly once.
 */
class SessionManager(
    private val store: TokenStore,
    private val auth: AuthRepository,
) {
    private val _signedOut = MutableStateFlow(false)
    val signedOut: StateFlow<Boolean> = _signedOut.asStateFlow()
    private val refreshMutex = Mutex()

    /** The access token to attach, or null when there is no session. */
    fun accessToken(): String? = store.current()?.accessToken

    suspend fun login(email: String, password: String): Outcome<TokenPair> =
        when (val result = auth.login(email, password)) {
            is Outcome.Success -> {
                store.save(result.value)
                _signedOut.value = false
                result
            }
            is Outcome.Failure -> result
        }

    /**
     * Refreshes and rotates the token pair. Returns true when a fresh access token is now
     * stored (retry the original request); false when there was nothing to refresh with or the
     * refresh failed (the session is now cleared and [signedOut] is true).
     */
    suspend fun refresh(): Boolean = refreshMutex.withLock {
        val refreshToken = store.current()?.refreshToken ?: return false
        when (val result = auth.refresh(refreshToken)) {
            is Outcome.Success -> {
                store.save(result.value) // rotation: the new pair replaces the old
                true
            }
            is Outcome.Failure -> {
                store.clear()
                _signedOut.value = true
                false
            }
        }
    }

    /** Global sign-out (user action or unrecoverable auth failure). */
    fun signOut() {
        store.clear()
        _signedOut.value = true
    }
}
