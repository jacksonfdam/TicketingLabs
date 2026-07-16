package com.ticketinglabs.client.core

/**
 * The explicit state of a single asynchronous operation, as observed by the UI.
 *
 * The UI is a pure function of this. Loading, empty, error, timeout, retrying and success
 * are distinct, modelled states, never inferred from a scatter of nulls and booleans. If
 * a screen renders a spinner, it is because the state is [Loading], not because `data`
 * happened to be null and `error` happened to be false.
 *
 * @param T the data carried on success.
 */
sealed interface UiState<out T> {

    /** Nothing has happened yet. The initial state before any load is triggered. */
    data object Idle : UiState<Nothing>

    /** A first load is in flight and there is no previous data to show. */
    data object Loading : UiState<Nothing>

    /** The operation succeeded with [data]. */
    data class Success<out T>(val data: T) : UiState<T>

    /** The operation succeeded but produced nothing to show (an empty list, no results). */
    data object Empty : UiState<Nothing>

    /** The operation failed with a typed [error]. */
    data class Error(val error: AppError) : UiState<Nothing>

    /**
     * A retry is in flight after a previous failure. Kept distinct from [Loading] so the
     * UI can say "trying again" rather than pretend the first attempt never happened.
     */
    data object Retrying : UiState<Nothing>

    /**
     * The operation exceeded its deadline. Distinct from [Error] because "the server said
     * nothing" is a different message, and for payment a different behaviour, than "the
     * server said no".
     */
    data class TimedOut(val error: AppError.Timeout) : UiState<Nothing>
}
