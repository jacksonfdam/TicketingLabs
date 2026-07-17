package com.ticketinglabs.client.domain.port

/**
 * Probes whether the backend gateway is reachable right now. A bounded, one-shot check used
 * to drive the connectivity banner and the offline-first behaviour: the app never blocks on
 * the network waiting to find out.
 */
interface ReachabilityChecker {
    /**
     * Returns true if the gateway answered its health endpoint within the timeout. Never
     * throws and never hangs: any failure (no connection, refused, slow, non-2xx) returns
     * false, so callers always get an answer.
     */
    suspend fun isServerReachable(): Boolean
}
