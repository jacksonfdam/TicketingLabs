# Client architecture

Three apps, one architecture. Kotlin Multiplatform, Flutter and React Native express it
in their own idioms, but the layering is identical, and it is the same layering the
backend lab uses. If you have read [`architecture.md`](architecture.md), this is that,
pointed at a screen instead of a database.

## The layers

```
Screen / Page (Atomic Design)
      │  observes state, sends events
State Holder            ViewModel (KMP) · Bloc/Cubit (Flutter) · hook + store (RN)
      │  calls
Use Case                pure business logic, no UI framework, unit-testable
      │  depends on
Repository Port         an interface; maps DTOs → validated domain models
      │  implemented by
Data Source Adapter     HTTP client → the API Gateway base URL
```

Rules that hold in every app:

- **The base URL is injected.** It is the only thing the app knows about the backend.
  No app contains a branch on "which backend is this". It consumes the OpenAPI contract
  and nothing else. See the recipe on consuming the injected base URL.
- **Use cases return a typed Result**, never throw across a layer boundary. Success or a
  typed error from the taxonomy; those are the only two outcomes.
- **Repositories validate.** A DTO generated from the contract is raw input. The
  repository turns it into a domain model or into a `MalformedResponse` error. Invalid
  data does not propagate as a half-populated object.
- **Cross-cutting concerns live in HTTP middleware**: auth token attachment, request-id
  propagation, retry, timeout, logging. One place per app, not sprinkled per call.

## Why this shape

Business logic that does not import a UI framework is business logic you can test in
milliseconds without a simulator. The state holder becomes a thin translator between "what
the use case returned" and "what the screen shows". The screen becomes a pure function of
state. Each layer is boring in isolation, which is the goal; interesting code is code that
pages you at 3am.

## Atomic Design

Components are organised atoms → molecules → organisms → templates → pages. Atoms hold no
business logic. State flows down, events flow up. Every atom, molecule and organism ships
a preview covering its states (default, loading, error, disabled, empty), and the preview
catalog is itself a deliverable — see the "component with previews" recipe.

- **Atoms:** Button, Text, Input, Badge, Spinner, Icon, CountdownTimer
- **Molecules:** FormField, SectorRow, QueuePositionCard, PriceTag, ErrorBanner, RetryPanel
- **Organisms:** EventCard, SectorList, ReservationSummary, OrderStatusPanel, WaitingRoom
- **Templates:** header/content/footer scaffolds with loading/error overlays
- **Pages:** the seven flow screens

## State model

Every async operation is one of `Idle | Loading | Success | Empty | Error | Retrying |
TimedOut`. Every error is a typed taxonomy value carrying a code, a `request_id`, a
message and a recovery affordance. The full model and the two domain state machines are
drawn in [`client-state-machines.md`](client-state-machines.md).

## Per-platform mapping

| Concern | KMP | Flutter | React Native |
|---|---|---|---|
| State holder | `ViewModel` + `StateFlow` | Bloc/Cubit (or Riverpod) | hooks + Zustand |
| Networking | Ktor + kotlinx.serialization | `dio` + generated models | `ky`/`fetch` + generated types |
| Server-state cache | store + repository cache | repository cache | TanStack Query |
| Secure storage | multiplatform settings + Keychain/Keystore | `flutter_secure_storage` | `expo-secure-store` |
| Previews | `@Preview` in `commonMain` | `@Preview` / widgetbook | Storybook for RN |

The generated DTOs, the tokens, the scenarios and the copy all come from
[`/shared`](../shared/). Nothing in that list is written three times.
