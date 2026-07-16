package com.ticketinglabs.client.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Wire DTOs, one per contract schema. These are generated-in-spirit: they mirror
 * `shared/contract/openapi.yaml` field for field and hold no logic. Enums are kept as raw
 * strings so an unrecognised value is caught by the mapper as a
 * [com.ticketinglabs.client.core.AppError.MalformedResponse] rather than throwing inside
 * the deserializer. Unknown *fields* are ignored by the Json config; unknown *values* in
 * known fields are rejected on mapping. That is the zero-trust posture.
 */

@Serializable
data class ErrorEnvelopeDto(val error: ErrorBodyDto)

@Serializable
data class ErrorBodyDto(
    val code: String,
    val message: String,
    @SerialName("request_id") val requestId: String,
)

@Serializable
data class TokenPairDto(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("token_type") val tokenType: String,
    @SerialName("expires_in") val expiresIn: Int,
)

@Serializable
data class EventDto(
    val id: String,
    val name: String,
    val venue: String,
    @SerialName("starts_at") val startsAt: String,
    @SerialName("sales_open_at") val salesOpenAt: String,
    val status: String,
)

@Serializable
data class SectorDto(
    val id: String,
    @SerialName("event_id") val eventId: String,
    val name: String,
    @SerialName("price_cents") val priceCents: Int,
    val currency: String,
    @SerialName("total_inventory") val totalInventory: Int,
    @SerialName("available_inventory") val availableInventory: Int,
)

@Serializable
data class EventDetailDto(
    val id: String,
    val name: String,
    val venue: String,
    @SerialName("starts_at") val startsAt: String,
    @SerialName("sales_open_at") val salesOpenAt: String,
    val status: String,
    val sectors: List<SectorDto>,
)

@Serializable
data class EventPageDto(
    val data: List<EventDto>,
    @SerialName("next_cursor") val nextCursor: String? = null,
)

@Serializable
data class QueueTokenDto(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("event_id") val eventId: String,
    val position: Int,
    val status: String,
    @SerialName("admitted_at") val admittedAt: String? = null,
)

@Serializable
data class ReservationDto(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("sector_id") val sectorId: String,
    val quantity: Int,
    val status: String,
    @SerialName("expires_at") val expiresAt: String,
)

@Serializable
data class OrderDto(
    val id: String,
    @SerialName("reservation_id") val reservationId: String,
    @SerialName("user_id") val userId: String,
    @SerialName("amount_cents") val amountCents: Int,
    val status: String,
    @SerialName("created_at") val createdAt: String,
)

// --- Request bodies ---

@Serializable
data class LoginRequestDto(val email: String, val password: String)

@Serializable
data class RefreshRequestDto(@SerialName("refresh_token") val refreshToken: String)

@Serializable
data class CreateReservationDto(
    @SerialName("sector_id") val sectorId: String,
    val quantity: Int,
)

@Serializable
data class CreateOrderDto(@SerialName("reservation_id") val reservationId: String)
