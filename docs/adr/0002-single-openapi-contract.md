# 2. A single OpenAPI contract is the source of truth

Date: 2026-07-15

## Status

Accepted

## Context

The whole project is one system implemented in seven backends. If each backend owns
its own idea of the API, the backends drift, the frontend has to care which one it is
talking to, and the entire premise collapses into seven slightly different products.

## Decision

There is exactly one API description: `contract/openapi.yaml`. Every backend
implements it. The frontend generates its HTTP client from it. The contract test
suite validates against it. No backend defines its own routes, payloads, or status
codes independently; it conforms or it fails the suite.

Cross-cutting rules live in the contract, not in prose someone might not read:
- every mutating endpoint accepts `Idempotency-Key`
- every response carries `X-Request-Id`
- errors use one envelope, `{ "error": { "code", "message", "request_id" } }`
- listings paginate by cursor

## Consequences

- Backends are interchangeable. Swapping the active one is a routing change, nothing
  more. This is the property the entire lab exists to demonstrate.
- The contract becomes a bottleneck for change, on purpose. Changing an endpoint
  means changing one file that everything keys off, so the blast radius is visible.
- There is upfront cost: you design the interface before writing handlers. Given the
  alternative is seven divergent interfaces, this is a bargain.
