package com.ticketinglabs.client.domain.model

import kotlin.jvm.JvmInline

/**
 * Typed identifiers. Every id in the contract is a UUID string, but a raw [String] lets
 * you pass an event id where a sector id was wanted and find out at runtime. These value
 * classes make that a compile error and cost nothing at runtime.
 */

@JvmInline value class EventId(val value: String)

@JvmInline value class SectorId(val value: String)

@JvmInline value class UserId(val value: String)

@JvmInline value class QueueTokenId(val value: String)

@JvmInline value class ReservationId(val value: String)

@JvmInline value class OrderId(val value: String)

/**
 * A point in time as epoch milliseconds. The domain does not depend on a date-time
 * library; the data layer parses the contract's ISO-8601 strings into this on the way in
 * and formats it on the way out. Keeps the core free of `kotlinx-datetime`.
 */
@JvmInline value class Timestamp(val epochMillis: Long)

/**
 * A monetary amount in minor units (cents) plus an ISO-4217 currency code. Money is never
 * a float here; you do not round someone's ticket price with binary fractions.
 *
 * @property amountCents the amount in the currency's minor unit; never negative.
 * @property currency a three-letter ISO-4217 code, e.g. "GBP".
 */
data class Money(val amountCents: Int, val currency: String) {
    init {
        require(amountCents >= 0) { "amountCents must be >= 0, was $amountCents" }
        require(currency.length == 3) { "currency must be a 3-letter code, was '$currency'" }
    }
}
