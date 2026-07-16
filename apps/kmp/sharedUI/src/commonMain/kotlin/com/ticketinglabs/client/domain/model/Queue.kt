package com.ticketinglabs.client.domain.model

/**
 * A place in the virtual queue, mirroring the contract's `QueueToken.status`.
 */
enum class QueueStatus {
    /** Still in line. */
    WAITING,

    /** Admitted; the user may now reserve. */
    ADMITTED,

    /** The token is no longer valid. */
    EXPIRED,
}

/**
 * The user's token in an event's waiting room. Mirrors `QueueToken`.
 *
 * @property position current place in line; 0 once admitted.
 * @property admittedAt when the user was let in, or null while still waiting.
 */
data class QueueToken(
    val id: QueueTokenId,
    val userId: UserId,
    val eventId: EventId,
    val position: Int,
    val status: QueueStatus,
    val admittedAt: Timestamp?,
) {
    /** True once the queue has let the user through. */
    val isAdmitted: Boolean get() = status == QueueStatus.ADMITTED

    init {
        require(position >= 0) { "position must be >= 0, was $position" }
    }
}
