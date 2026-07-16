package com.ticketinglabs.client.domain

import com.ticketinglabs.client.domain.model.EventId
import com.ticketinglabs.client.domain.model.Money
import com.ticketinglabs.client.domain.model.Sector
import com.ticketinglabs.client.domain.model.SectorId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Domain invariants. The models reject impossible data at construction, so an invalid DTO
 * cannot become a half-valid domain object. Zero trust applies even to our own mapping.
 */
class DomainModelTest {

    @Test
    fun a_sector_with_more_available_than_total_is_rejected() {
        assertFailsWith<IllegalArgumentException> {
            Sector(SectorId("s"), EventId("e"), "VIP", Money(1000, "GBP"), total = 10, available = 20)
        }
    }

    @Test
    fun a_sector_reports_sold_out_when_availability_is_zero() {
        val soldOut = Sector(SectorId("s"), EventId("e"), "Stalls", Money(5000, "GBP"), total = 100, available = 0)
        assertTrue(soldOut.isSoldOut)

        val open = soldOut.copy(availableInventory = 1)
        assertFalse(open.isSoldOut)
    }

    @Test
    fun money_rejects_a_bad_currency_code() {
        assertFailsWith<IllegalArgumentException> { Money(1000, "POUNDS") }
    }

    @Test
    fun money_rejects_a_negative_amount() {
        assertFailsWith<IllegalArgumentException> { Money(-1, "GBP") }
    }

    @Test
    fun money_accepts_a_valid_amount() {
        assertEquals(1000, Money(1000, "GBP").amountCents)
    }
}

private fun Sector(id: SectorId, eventId: EventId, name: String, price: Money, total: Int, available: Int) =
    Sector(id = id, eventId = eventId, name = name, price = price, totalInventory = total, availableInventory = available)
