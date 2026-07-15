# 3. Business logic lives in a framework-agnostic service layer

Date: 2026-07-15

## Status

Accepted

## Context

The comparison this lab makes is only fair if the frameworks are compared on the
thing they actually are: the delivery mechanism. If the reservation logic is tangled
into a Laravel controller in one backend and a Go handler in another, we are
comparing two different programs, not two framework idioms.

## Decision

Every backend uses the same layering:

```
controller/handler -> use case / service -> repository (port) -> adapter (DB/cache/queue)
```

- Business rules live in use cases / services, with no import of the web framework.
- Repositories are ports (interfaces). Concrete adapters (Postgres, Redis, broker)
  are injected. The domain depends on the abstraction; the driver depends on the
  domain. Dependency inversion, applied rather than quoted.
- Controllers are thin: parse, validate, call a use case, serialize. A controller
  that contains a business rule is a bug.

## Consequences

- Use cases are unit-testable with in-memory fakes and no running infrastructure.
- The interesting comparison across backends is narrowed to how each framework does
  routing, validation, and dependency injection, which is exactly the comparison we
  want.
- More files and more indirection than a fat-controller approach. For a teaching
  codebase this is the point; for a weekend script it would be overkill, and we say
  so in the recipes.
