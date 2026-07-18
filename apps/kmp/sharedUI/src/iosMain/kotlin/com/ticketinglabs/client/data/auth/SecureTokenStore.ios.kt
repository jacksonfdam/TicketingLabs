@file:OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)

package com.ticketinglabs.client.data.auth

import com.ticketinglabs.client.domain.model.TokenPair
import com.ticketinglabs.client.domain.port.TokenStore
import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.alloc
import kotlinx.cinterop.convert
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import kotlinx.cinterop.readBytes
import kotlinx.cinterop.usePinned
import kotlinx.cinterop.value
import platform.CoreFoundation.CFDictionaryAddValue
import platform.CoreFoundation.CFDictionaryCreateMutable
import platform.CoreFoundation.CFDictionaryRef
import platform.CoreFoundation.CFStringRef
import platform.CoreFoundation.CFTypeRef
import platform.CoreFoundation.CFTypeRefVar
import platform.CoreFoundation.kCFAllocatorDefault
import platform.CoreFoundation.kCFBooleanTrue
import platform.Foundation.CFBridgingRelease
import platform.Foundation.CFBridgingRetain
import platform.Foundation.NSData
import platform.Foundation.create
import platform.Security.SecItemAdd
import platform.Security.SecItemCopyMatching
import platform.Security.SecItemDelete
import platform.Security.errSecSuccess
import platform.Security.kSecAttrAccount
import platform.Security.kSecAttrService
import platform.Security.kSecClass
import platform.Security.kSecClassGenericPassword
import platform.Security.kSecMatchLimit
import platform.Security.kSecMatchLimitOne
import platform.Security.kSecReturnData
import platform.Security.kSecValueData

private const val SERVICE = "com.ticketinglabs.client.tokens"

actual fun createSecureTokenStore(): TokenStore = KeychainTokenStore()

/**
 * Backs the refresh token with the iOS Keychain (a generic-password item per key, scoped to
 * [SERVICE]). SecItem* calls are synchronous, so no in-memory mirror is needed: a persisted
 * session is readable immediately on cold start. Kotlin strings are bridged through
 * [CFBridgingRetain] and the token bytes through [NSData]; there is no `String as NSString` cast
 * (which does not survive at runtime on Kotlin/Native).
 */
private class KeychainTokenStore : TokenStore {

    override fun current(): TokenPair? {
        val access = read(ACCESS) ?: return null
        val refresh = read(REFRESH) ?: return null
        return TokenPair(access, refresh, read(EXPIRES)?.toIntOrNull() ?: 0)
    }

    override fun save(tokens: TokenPair) {
        write(ACCESS, tokens.accessToken)
        write(REFRESH, tokens.refreshToken)
        write(EXPIRES, tokens.expiresInSeconds.toString())
    }

    override fun clear() {
        listOf(ACCESS, REFRESH, EXPIRES).forEach { delete(it) }
    }

    private fun write(account: String, value: String) {
        // Delete-then-add keeps the write idempotent without a separate SecItemUpdate path.
        delete(account)
        val query = query(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to CFBridgingRetain(SERVICE),
            kSecAttrAccount to CFBridgingRetain(account),
            kSecValueData to CFBridgingRetain(value.toNSData()),
        )
        SecItemAdd(query, null)
    }

    private fun read(account: String): String? = memScoped {
        val query = query(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to CFBridgingRetain(SERVICE),
            kSecAttrAccount to CFBridgingRetain(account),
            kSecReturnData to kCFBooleanTrue,
            kSecMatchLimit to kSecMatchLimitOne,
        )
        val result = alloc<CFTypeRefVar>()
        val status = SecItemCopyMatching(query, result.ptr)
        if (status != errSecSuccess) return@memScoped null
        (CFBridgingRelease(result.value) as? NSData)?.toKString()
    }

    private fun delete(account: String) {
        val query = query(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to CFBridgingRetain(SERVICE),
            kSecAttrAccount to CFBridgingRetain(account),
        )
        SecItemDelete(query)
    }

    private fun query(vararg pairs: Pair<CFStringRef?, CFTypeRef?>): CFDictionaryRef {
        val dict = CFDictionaryCreateMutable(kCFAllocatorDefault, pairs.size.convert(), null, null)
        pairs.forEach { (key, value) -> CFDictionaryAddValue(dict, key, value) }
        return dict!!
    }

    private companion object {
        const val ACCESS = "access_token"
        const val REFRESH = "refresh_token"
        const val EXPIRES = "expires_in"
    }
}

private fun String.toNSData(): NSData {
    val bytes = encodeToByteArray()
    if (bytes.isEmpty()) return NSData()
    return bytes.usePinned { pinned ->
        NSData.create(bytes = pinned.addressOf(0), length = bytes.size.convert())
    }
}

private fun NSData.toKString(): String? {
    val length = this.length.toInt()
    if (length == 0) return ""
    val pointer = this.bytes ?: return null
    return pointer.readBytes(length).decodeToString()
}
