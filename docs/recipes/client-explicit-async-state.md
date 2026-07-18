# Recipe: async as an explicit state, errors as a typed taxonomy

Cross-platform: Kotlin Multiplatform, Flutter, React Native.

## Problem

A screen fetches data. It can be loading, empty, showing data, failing, or timing out. The
lazy version infers all of that from nulls scattered across the view — `data == null ? spinner
: list` — and then a fourth state appears (offline) and the whole thing rots. Errors get the
same disrespect: a bare `catch (e)` that shows "something went wrong" and loses every detail
worth acting on.

## Concept

Two unions, modelled once. The UI state is `Idle | Loading | Success(data) | Empty |
Error(typed) | Retrying | TimedOut`, and the screen is a pure function of it. The error is a
**typed taxonomy** — `NetworkUnavailable`, `Timeout`, `Unauthorized`, `Conflict`,
`MalformedResponse`, `PaymentDeclined`, `PaymentUnknown`, … — each carrying a code, the
response `request_id`, and a recovery affordance. A timeout is a distinct state from an error,
because "the server said no" and "the server said nothing" want different words and different
buttons.

## Implementation ×3

**KMP** — `core/UiState.kt`, `core/AppError.kt`, `presentation/StateMapping.kt`

```kotlin
sealed interface UiState<out T> {
    data object Idle : UiState<Nothing>
    data object Loading : UiState<Nothing>
    data class Success<T>(val data: T) : UiState<T>
    data class Error(val error: AppError) : UiState<Nothing>
    data class TimedOut(val error: AppError.Timeout) : UiState<Nothing>
    // …Empty, Retrying
}

fun AppError.toUiState(): UiState<Nothing> =
    if (this is AppError.Timeout) UiState.TimedOut(this) else UiState.Error(this)
```

One `UiStateContent(state) { data -> … }` composable renders loading/empty/error/timeout
consistently; the screen supplies only the success case.

**Flutter** — `lib/core/core.dart`, `lib/ui/widgets.dart`

```dart
sealed class UiState<T> { const UiState(); }
class UiLoading<T> extends UiState<T> { const UiLoading(); }
class UiSuccess<T> extends UiState<T> { final T data; const UiSuccess(this.data); }
class UiError<T> extends UiState<T> { final AppError error; const UiError(this.error); }
// …UiIdle, UiEmpty, UiRetrying, UiTimedOut

UiState<T> errorToUiState<T>(AppError e) =>
    e is TimeoutError ? UiTimedOut<T>(e) : UiError<T>(e);
```

`UiStateView<T>` switches over the sealed state; Dart's exhaustive `switch` makes a missed
case a compile error.

**React Native** — `src/core/core.ts`, `src/ui/widgets.tsx`

```ts
export type UiState<T> =
  | { kind: 'idle' } | { kind: 'loading' } | { kind: 'retrying' } | { kind: 'empty' }
  | { kind: 'success'; data: T }
  | { kind: 'error'; error: AppError }
  | { kind: 'timedOut'; error: AppError };

export const errorToUiState = <T>(e: AppError): UiState<T> =>
  e.code === 'Timeout' ? { kind: 'timedOut', error: e } : { kind: 'error', error: e };
```

`<UiStateView state={…}>{(data) => …}</UiStateView>` renders the non-success cases from a
`switch` on `state.kind`.

## Comparison

- **KMP** and **Flutter** have real sealed types with compiler-enforced exhaustiveness — the
  strongest guarantee that no state is forgotten. KMP's `out T` variance lets one `toUiState()`
  returning `UiState<Nothing>` slot into any `UiState<T>`; Dart needs the generic on the helper.
- **React Native** uses a discriminated union. TypeScript's exhaustiveness is real but opt-in
  (a `default: never` or `switch` completeness lint), not enforced by default.

## How to see it work

Point an app at a dead server and watch the events screen: it shows a spinner, then the
error banner with the taxonomy copy and a Retry — never a blank screen or an infinite spinner.
The mapping is unit-tested in every app (a network failure → `Error`, a timeout → `TimedOut`).

## Trade-offs

Modelling six states for every async surface is more up-front code than a nullable and a
boolean. It pays off the moment a second failure mode appears: you add one variant and the
compiler (KMP/Flutter) walks you to every place that must handle it. In TypeScript you get the
same shape but must keep exhaustiveness honest yourself.
