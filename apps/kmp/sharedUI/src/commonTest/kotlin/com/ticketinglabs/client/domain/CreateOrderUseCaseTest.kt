package com.ticketinglabs.client.domain

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.Outcome
import com.ticketinglabs.client.domain.model.ReservationId
import com.ticketinglabs.client.domain.usecase.CreateOrderUseCase
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertIs

/**
 * Covers the unknown-outcome mapping that keeps the payment flow honest. Scenarios:
 * `payment-unknown-outcome`, `payment-network-drop`, `payment-declined`.
 */
class CreateOrderUseCaseTest {

    @Test
    fun timeout_during_create_maps_to_PaymentUnknown_not_failure() = runTest {
        val useCase = CreateOrderUseCase(FakeOrderRepo(onCreate = { Outcome.Failure(AppError.Timeout()) }))
        val result = useCase(ReservationId("r1"), "k")

        assertIs<Outcome.Failure>(result)
        assertIs<AppError.PaymentUnknown>(result.error)
    }

    @Test
    fun network_drop_during_create_maps_to_PaymentUnknown() = runTest {
        val useCase = CreateOrderUseCase(FakeOrderRepo(onCreate = { Outcome.Failure(AppError.NetworkUnavailable()) }))
        val result = useCase(ReservationId("r1"), "k")

        assertIs<Outcome.Failure>(result)
        assertIs<AppError.PaymentUnknown>(result.error)
    }

    @Test
    fun a_real_conflict_is_passed_through_unchanged() = runTest {
        val useCase = CreateOrderUseCase(
            FakeOrderRepo(onCreate = { Outcome.Failure(AppError.Conflict(backendCode = "reservation_expired")) }),
        )
        val result = useCase(ReservationId("r1"), "k")

        assertIs<Outcome.Failure>(result)
        assertIs<AppError.Conflict>(result.error)
    }
}
