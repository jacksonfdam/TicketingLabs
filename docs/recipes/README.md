# Recipes

The actual product of this lab. Each recipe takes one concept from the checklist, states
the domain problem it solves, explains the idea language-agnostically, points at the real
code that implements it, shows how to see it working, and is honest about the trade-offs.
Every one is reproducible from a fresh clone. New recipes follow [TEMPLATE.md](TEMPLATE.md).

## Concurrency — the heart of the domain

- [Idempotent, oversell-proof reservations](reservation-idempotency-go.md) — the main
  dish: idempotency guard + distributed lock + atomic conditional decrement + TTL hold.
- [A distributed lock in Redis](distributed-lock-redis.md) — `SET NX PX` and a
  token-checked release, and why it is contention management, not the correctness guarantee.
- [Proving no overselling under load](no-overselling-under-load.md) — the k6 stampede:
  100 of 100 seats, 400 attempts, 0 over-sold.
- [Horizontal scale without overselling](horizontal-scale-no-oversell.md) — the same,
  across three replicas sharing one Postgres and Redis.
- [A virtual waiting room](virtual-queue.md) — the pressure valve in front of checkout.

## Availability & resilience

- [Circuit breaker, retry, and timeout](resilience-circuit-breaker-go.md) — surviving a
  failing payment provider with graceful degradation.
- [Asynchronous payment via a broker](async-payment-broker.md) — `202 Accepted`, a
  worker, and a signed webhook, so payment never blocks the buyer.

## Security

- [Security in every layer](security-layers.md) — the section-8 checklist mapped to code,
  plus the encryption-at-rest strategy.
- [JWT access tokens with refresh rotation](jwt-refresh-rotation.md) — short access
  tokens, revoke-on-use refresh tokens, theft detection.
- [Mutual TLS between the gateway and the backend](mtls-gateway-backend.md) — neither side
  trusts the network; both verify certificates.
- [Rate limiting (two layers)](rate-limiting.md) — the edge protects the system, the app
  protects a resource.

## Performance

- [HTTP caching with ETag and Cache-Control](http-caching-etag.md) — cheap re-fetches
  without serving stale availability on the hot path.

## Observability

- [RED metrics at the gateway](observability-red-metrics.md) — one dashboard for all
  seven backends, collected at the edge.
- [Distributed tracing with OpenTelemetry](distributed-tracing-go.md) — the inside of a
  request: `POST` → lock → decrement.

## Clients (mobile) — one concept, three platforms

Each takes a single client concern and shows it in Kotlin Multiplatform, Flutter and React
Native side by side, with real file paths.

- [The injected base URL (and a reachability probe that can't hang)](client-injected-base-url.md)
  — one place to configure the gateway; a bounded `/health` check that resolves to online/offline.
- [Async as an explicit state, errors as a typed taxonomy](client-explicit-async-state.md) —
  `UiState` and `AppError` modelled once so the UI is a pure function of state.
- [Defensive deserialization](client-defensive-deserialization.md) — parsing is validation;
  a bad payload becomes one `MalformedResponse`, never a crash.
- [Idempotency, the double tap, and the unknown payment](client-idempotency-and-payment.md) —
  one idempotency key per intent, an in-flight guard, and reconcile-by-polling so a timed-out
  charge is neither double-billed nor falsely failed.

## Per-backend

Each backend's own README is a "recipe" for that stack — how it expresses the same
hexagonal architecture idiomatically, and the version/tooling gotchas that bit us:
[go](../../backends/go/README.md) · [fastapi](../../backends/fastapi/README.md) ·
[nest](../../backends/nest/README.md) · [express](../../backends/express/README.md) ·
[laravel](../../backends/laravel/README.md) · [symfony](../../backends/symfony/README.md) ·
[phalcon](../../backends/phalcon/README.md).
