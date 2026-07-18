package com.ticketinglabs.client.data.auth

import com.ticketinglabs.client.domain.port.TokenStore

/**
 * Creates the platform-backed [TokenStore]: the iOS Keychain, or Android
 * EncryptedSharedPreferences (Keystore-wrapped). Both platforms expose a *synchronous* secure
 * API, so — unlike the Flutter and React Native clients, whose secure APIs are async and need an
 * in-memory mirror — reads hit the secure store directly. A persisted refresh token is therefore
 * available immediately on cold start, and nothing above the [TokenStore] port changes.
 */
expect fun createSecureTokenStore(): TokenStore
