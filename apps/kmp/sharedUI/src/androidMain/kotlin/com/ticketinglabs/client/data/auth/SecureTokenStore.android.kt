package com.ticketinglabs.client.data.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.ticketinglabs.client.domain.model.TokenPair
import com.ticketinglabs.client.domain.port.TokenStore

/**
 * Bridges the Android [Context] to [createSecureTokenStore], which the shared composition root
 * calls with no arguments. The Android entry point sets [appContext] before the backend is built.
 */
object AndroidSecureStore {
    lateinit var appContext: Context
}

actual fun createSecureTokenStore(): TokenStore = EncryptedPrefsTokenStore(AndroidSecureStore.appContext)

/**
 * Backs the refresh token with EncryptedSharedPreferences: values are encrypted with a key held
 * in the Android Keystore. (androidx.security-crypto is in maintenance; it remains the canonical
 * example of the Keystore-wrapped pattern, which is the point here.) Reads are synchronous, so no
 * in-memory mirror is needed.
 */
private class EncryptedPrefsTokenStore(context: Context) : TokenStore {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "ticketing.tokens",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    override fun current(): TokenPair? {
        val access = prefs.getString(ACCESS, null) ?: return null
        val refresh = prefs.getString(REFRESH, null) ?: return null
        return TokenPair(access, refresh, prefs.getInt(EXPIRES, 0))
    }

    override fun save(tokens: TokenPair) {
        prefs.edit()
            .putString(ACCESS, tokens.accessToken)
            .putString(REFRESH, tokens.refreshToken)
            .putInt(EXPIRES, tokens.expiresInSeconds)
            .apply()
    }

    override fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val ACCESS = "access_token"
        const val REFRESH = "refresh_token"
        const val EXPIRES = "expires_in"
    }
}
