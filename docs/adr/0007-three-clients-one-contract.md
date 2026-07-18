# 7. Three client apps, one contract, no backend awareness

Date: 2026-07-16

## Status

Accepted

## Context

The client lab is the mobile companion to the backend lab. The teaching goal is
comparison: show how Kotlin Multiplatform, Flutter and React Native each solve the same
problems. That only works if the apps are genuinely the same product. If they diverge in
flow, states or the API they assume, the comparison is between three different things and
proves nothing.

There is also a standing rule from ADR 2: the backend is interchangeable. A client that
knows which backend answers breaks that property from the outside.

## Decision

Three apps, one contract, identical flow.

- Each app implements the same seven-screen flow and consumes the same OpenAPI contract
  ([`/shared/contract`](../../shared/contract/)). Screens, states and transitions match.
- Each app receives only a **base URL** through configuration. It has no knowledge of the
  backend technology and contains **no** conditional logic keyed to a backend.
- Each app follows the same layering — UI → state holder → use case → repository port →
  data source adapter — expressed idiomatically per platform. See
  [`docs/client-architecture.md`](../client-architecture.md).
- Every async operation resolves into an explicit modelled state; errors are a typed
  taxonomy. No silent catches, no unhandled exceptions.

## Consequences

- The apps are comparable line for line. That is the exhibit the lab exists to show.
- Adding a platform means implementing the same spec again, not designing a new app. The
  cost is real and repetitive, which is exactly what makes the comparison fair.
- The apps must treat the contract as a promise, not a guarantee — defensive parsing and
  a `MalformedResponse` state, because a backend bug must not crash a client. See ADR 8
  and the scenarios.
