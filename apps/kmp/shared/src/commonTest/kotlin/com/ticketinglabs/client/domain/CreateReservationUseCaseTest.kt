package com.ticketinglabs.client.domain

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.domain.model.SectorId
import com.ticketinglabs.client.domain.usecase.CreateReservationUseCase
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Covers the two defences in the reservation use case: input hardening and idempotency.
 * Scenarios: `reservation-create`, `double-tap-reservation`.
 */
class CreateReservationUseCaseTest {

    @Test
    fun quantity_below_range_is_rejected_before_any_network_call() = runTest {
        val repo = FakeReservationRepo()
        val result = CreateReservationUseCase(repo)(SectorId("s1"), 0, "k")

        assertIs<Outcome.Failure>(result)
        assertIs<AppError.Validation>(result.error)
        assertTrue(repo.keysSeen.isEmpty(), "a rejected input must never reach the repository")
    }

    @Test
    fun quantity_above_range_is_rejected() = runTest {
        val repo = FakeReservationRepo()
        val result = CreateReservationUseCase(repo)(SectorId("s1"), 9, "k")

        assertIs<Outcome.Failure>(result)
        assertIs<AppError.Validation>(result.error)
    }

    @Test
    fun double_tap_sends_the_same_stable_key_twice() = runTest {
        val repo = FakeReservationRepo()
        val useCase = CreateReservationUseCase(repo)
        val key = "intent-42"

        useCase(SectorId("s1"), 2, key)
        useCase(SectorId("s1"), 2, key)

        assertEquals(listOf(key, key), repo.keysSeen, "both taps must carry one stable key so the server dedupes")
    }
}
