package com.ticketinglabs.client.domain.model

/**
 * The lifecycle of an event's sale, mirroring the contract's `Event.status` enum.
 */
enum class EventStatus {
    /** Not yet announced for sale. */
    DRAFT,

    /** On sale now. */
    ON_SALE,

    /** Everything is gone. */
    SOLD_OUT,

    /** Sales have ended. */
    CLOSED,
}

/**
 * An event as shown in the list and header of the detail screen.
 *
 * @property id stable identifier.
 * @property name display name.
 * @property venue where it happens.
 * @property startsAt when the event itself begins.
 * @property salesOpenAt when tickets go on sale.
 * @property status current sale lifecycle state.
 */
data class Event(
    val id: EventId,
    val name: String,
    val venue: String,
    val startsAt: Timestamp,
    val salesOpenAt: Timestamp,
    val status: EventStatus,
)

/**
 * A block of seats at a single price, mirroring the contract's `Sector`.
 *
 * @property availableInventory seats still buyable; drives the "sold out" state when zero.
 * @property totalInventory the sector's capacity.
 */
data class Sector(
    val id: SectorId,
    val eventId: EventId,
    val name: String,
    val price: Money,
    val totalInventory: Int,
    val availableInventory: Int,
) {
    /** True when there is nothing left to sell in this sector. */
    val isSoldOut: Boolean get() = availableInventory <= 0

    init {
        require(totalInventory >= 0) { "totalInventory must be >= 0" }
        require(availableInventory in 0..totalInventory) {
            "availableInventory ($availableInventory) must be within 0..$totalInventory"
        }
    }
}

/**
 * An event plus its sectors, as shown on the detail screen. Mirrors `EventDetail`.
 */
data class EventDetail(
    val event: Event,
    val sectors: List<Sector>,
)

/**
 * One page of events plus the cursor for the next page. Mirrors `EventPage`.
 *
 * @property nextCursor pass to the next request; null when there are no more pages.
 */
data class EventPage(
    val events: List<Event>,
    val nextCursor: String?,
)
