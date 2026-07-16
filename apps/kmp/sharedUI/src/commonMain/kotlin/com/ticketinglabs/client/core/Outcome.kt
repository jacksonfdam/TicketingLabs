package com.ticketinglabs.client.core

/**
 * The result of any operation that can fail in a modelled way.
 *
 * Use cases return an [Outcome], never throw across a layer boundary. A caller has
 * exactly two cases to handle: it worked, or it failed with a typed [AppError]. There is
 * no third "it threw something" case to forget about, which is the entire point.
 *
 * @param T the value produced on success.
 */
sealed interface Outcome<out T> {

    /**
     * The operation succeeded and produced [value].
     */
    data class Success<out T>(val value: T) : Outcome<T>

    /**
     * The operation failed with a typed [error]. Never an exception, never a null.
     */
    data class Failure(val error: AppError) : Outcome<Nothing>
}

/**
 * Maps the success value while leaving a [Outcome.Failure] untouched.
 *
 * Lets a use case reshape a repository result without unwrapping and re-wrapping the
 * error by hand. A failure passes straight through.
 */
inline fun <T, R> Outcome<T>.map(transform: (T) -> R): Outcome<R> = when (this) {
    is Outcome.Success -> Outcome.Success(transform(value))
    is Outcome.Failure -> this
}

/**
 * Returns the success value, or [fallback] if this is a failure.
 */
fun <T> Outcome<T>.getOrElse(fallback: T): T = when (this) {
    is Outcome.Success -> value
    is Outcome.Failure -> fallback
}

/**
 * Runs [action] only on success. Returns the receiver so calls can chain.
 */
inline fun <T> Outcome<T>.onSuccess(action: (T) -> Unit): Outcome<T> {
    if (this is Outcome.Success) action(value)
    return this
}

/**
 * Runs [action] only on failure. Returns the receiver so calls can chain.
 */
inline fun <T> Outcome<T>.onFailure(action: (AppError) -> Unit): Outcome<T> {
    if (this is Outcome.Failure) action(error)
    return this
}
