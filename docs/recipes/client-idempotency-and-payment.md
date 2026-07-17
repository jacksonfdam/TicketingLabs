# Recipe: idempotency, the double tap, and the payment you're not sure happened

Cross-platform: Kotlin Multiplatform, Flutter, React Native.

## Problem

Two failures that cost real money. First, the double tap: a user hammers "Reserve" and you
create two holds, or worse, two orders. Second, the unknown outcome: you `POST /orders`, the
gateway times out, and you have no idea whether the charge went through. Assume failure and
the user pays twice; assume success and you ship a ticket you were never paid for. This is the
single most instructive case in the whole lab.

## Concept

Two defences, belt and braces. A **client-generated idempotency key**, stable across retries
of one intent, so a retried mutation is a no-op server-side. And an **in-flight guard** in the
state holder, so a second tap while the first is pending does nothing. For payment, one rule
above all: **never assume**. A create that times out maps to `PaymentUnknown` (not failure);
the app keeps the same key and **reconciles by polling** the order status until the server
states a real outcome. No double charge, no false failure.

## Implementation ×3

The reconcile decision is a pure function — no timers, exhaustively testable:

**KMP** — `domain/usecase/OrderReconciler.kt`, `CreateOrderUseCase.kt`

```kotlin
// create: a timeout/network drop is NOT a failure — it is unknown
is Outcome.Failure -> if (error is AppError.Timeout || error is AppError.NetworkUnavailable)
    Outcome.Failure(AppError.PaymentUnknown(...)) else result

// one poll → one decision
fun next(poll: Outcome<Order>): Reconciliation = when (poll) {
    is Outcome.Success -> if (poll.value.isSettled) Resolved(poll.value) else Continue
    is Outcome.Failure -> if (poll.error.isTransient) Continue else Abort(poll.error)
}
```

`OrderViewModel.checkout` creates with one `intentKey`, retries `PaymentUnknown` with the same
key, then polls via `OrderReconciler` until settled. `ReservationViewModel.reserve` ignores a
second call while one is in flight and reuses the intent's key.

**Flutter** — `lib/domain/usecases.dart`, `lib/presentation/cubits.dart`

```dart
Reconciliation reconcileOrderPoll(Outcome<Order> r) => switch (r) {
      Success(value: final o) => o.isSettled ? Resolved(o) : const Continue(),
      Failure(error: final e) when e is TimeoutError || e is PaymentUnknown => const Continue(),
      Failure(error: final e) => Abort(e),
    };
```

`OrderCubit` owns `_createReconciling` (retry unknown with the same key) then `_pollUntilSettled`.

**React Native** — `src/domain/usecases.ts`, `src/presentation/stores.ts`

```ts
export function reconcileOrderPoll(r: Outcome<Order>): Reconciliation {
  if (r.ok) return isSettled(r.value) ? { kind: 'resolved', order: r.value } : { kind: 'continue' };
  const c = r.error.code;
  if (c === 'PaymentUnknown' || c === 'Timeout' || c === 'NetworkUnavailable' || c === 'RateLimited')
    return { kind: 'continue' };
  return { kind: 'abort', error: r.error };
}
```

The order store guards re-entry, reuses one key, retries unknown, then polls.

## Comparison

The logic is identical because it is just data and functions; only the syntax of the sealed
result differs (Kotlin `when`, Dart `switch` with guards, a TypeScript tagged union). All three
keep the "when do we stop polling" decision in a pure function separate from the timers, which
is why it can be tested without waiting for anything.

## How to see it work

The tests drive the whole payment matrix with virtual time: create returns `PaymentUnknown`
twice then succeeds, polling returns pending then paid — and the app must end at `paid` having
sent **the same idempotency key every time**. The double-tap test fires two reservations while
the first is in flight and asserts exactly one request with one key.

- KMP — `.../commonTest/.../presentation/OrderViewModelTest.kt`, `ViewModelsTest.kt`
- Flutter — `apps/flutter/test/cubits_test.dart`
- React Native — `apps/react-native/src/presentation/stores.test.ts`

## Trade-offs

Polling is not elegant — a push (webhook-driven, or a socket) would settle faster and cost less
battery. But polling with idempotency is *robust*: it needs nothing from the client's network
staying up at the wrong moment, and it degrades to "try again in a second" instead of
"corrupt state". For a flash sale, robust beats elegant. The cost is a handful of extra GETs
per checkout and a bounded retry budget on the unknown-outcome path so it, too, cannot spin
forever.
