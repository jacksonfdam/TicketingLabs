package com.ticketinglabs.client.presentation

import com.ticketinglabs.client.domain.port.ReachabilityChecker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals

/** The connectivity check always resolves — never a spinner that never ends. */
class ConnectivityViewModelTest {

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    private fun checker(reachable: Boolean) = object : ReachabilityChecker {
        override suspend fun isServerReachable() = reachable
    }

    @Test
    fun a_reachable_server_resolves_to_online() = runTest {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))
        val vm = ConnectivityViewModel(checker(reachable = true))
        advanceUntilIdle()
        assertEquals(Connectivity.ONLINE, vm.state.value)
    }

    @Test
    fun an_unreachable_server_resolves_to_offline() = runTest {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))
        val vm = ConnectivityViewModel(checker(reachable = false))
        advanceUntilIdle()
        assertEquals(Connectivity.OFFLINE, vm.state.value)
    }
}
