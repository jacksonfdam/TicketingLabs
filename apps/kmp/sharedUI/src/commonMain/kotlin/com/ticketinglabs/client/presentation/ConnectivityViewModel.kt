package com.ticketinglabs.client.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ticketinglabs.client.domain.port.ReachabilityChecker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** The three states the connectivity banner renders. */
enum class Connectivity { CHECKING, ONLINE, OFFLINE }

/**
 * Drives the connectivity banner. [check] probes the gateway once and always resolves to
 * ONLINE or OFFLINE within the checker's timeout — there is no state that spins forever.
 * The app stays usable while OFFLINE (offline-first): the banner informs, it does not block.
 */
class ConnectivityViewModel(
    private val checker: ReachabilityChecker,
) : ViewModel() {

    private val _state = MutableStateFlow(Connectivity.CHECKING)
    val state: StateFlow<Connectivity> = _state.asStateFlow()

    init {
        check()
    }

    /** Re-probes reachability. Sets CHECKING, then resolves to ONLINE/OFFLINE. */
    fun check() {
        _state.value = Connectivity.CHECKING
        viewModelScope.launch {
            _state.value = if (checker.isServerReachable()) Connectivity.ONLINE else Connectivity.OFFLINE
        }
    }
}
