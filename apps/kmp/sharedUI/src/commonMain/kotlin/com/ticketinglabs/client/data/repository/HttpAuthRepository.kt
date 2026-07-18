package com.ticketinglabs.client.data.repository

import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.data.http.ApiExecutor
import com.ticketinglabs.client.domain.model.TokenPair
import com.ticketinglabs.client.domain.port.AuthRepository
import io.ktor.http.HttpMethod
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Talks to `/auth/login` and `/auth/refresh`. Uses a plain executor with no session attached:
 * login has no token yet, and refresh must not carry the (expired) access token or it would
 * recurse. The response is mapped defensively like every other payload.
 */
class HttpAuthRepository(
    private val api: ApiExecutor,
    private val json: Json,
) : AuthRepository {

    override suspend fun login(email: String, password: String): Outcome<TokenPair> = api.execute(
        method = HttpMethod.Post,
        path = "auth/login",
        bodyJson = json.encodeToString(LoginBody(email, password)),
        event = "auth.login",
        parse = { json.decodeFromString<TokenPairDto>(it).toDomain() },
    )

    override suspend fun refresh(refreshToken: String): Outcome<TokenPair> = api.execute(
        method = HttpMethod.Post,
        path = "auth/refresh",
        bodyJson = json.encodeToString(RefreshBody(refreshToken)),
        event = "auth.refresh",
        parse = { json.decodeFromString<TokenPairDto>(it).toDomain() },
    )
}

@Serializable
private data class LoginBody(val email: String, val password: String)

@Serializable
private data class RefreshBody(@SerialName("refresh_token") val refreshToken: String)

@Serializable
private data class TokenPairDto(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_in") val expiresIn: Int,
)

private fun TokenPairDto.toDomain() = TokenPair(accessToken, refreshToken, expiresIn)
