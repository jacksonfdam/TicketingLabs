package com.ticketinglabs.client.presentation

import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.UiState

/**
 * Maps a typed [AppError] to the UI state that represents it. A [AppError.Timeout] becomes
 * [UiState.TimedOut] (the server said nothing); everything else becomes [UiState.Error]
 * (the server, or the client, said no). Kept in one place so every store agrees.
 *
 * Returns `UiState<Nothing>`, which is assignable to any `UiState<T>` because [UiState] is
 * covariant — so a store for events and a store for orders share this without casts.
 */
fun AppError.toUiState(): UiState<Nothing> =
    if (this is AppError.Timeout) UiState.TimedOut(this) else UiState.Error(this)
