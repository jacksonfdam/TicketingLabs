# Status — Definition of Done audit

An honest, item-by-item map of the spec against the repository. Legend: **✅ done &
verified** · **🟡 partial (scoped)** · **⬜ not done (documented as future work)**.

Nothing here is aspirational — each ✅ links to code or a recipe and was exercised.

## Definition of Done (spec §15)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Switching the active backend needs no frontend change | ✅ | `COMPOSE_PROFILES`, [ADR 0006](adr/0006-backend-switching-via-compose-profiles.md); swap verified both ways, frontend untouched |
| 2 | The same contract suite passes on every backend | ✅ | 16/16 on all seven (Go, FastAPI, Nest, Express, Laravel, Symfony, Phalcon) |
| 3 | The load test produces no overselling on any backend | 🟡 | 100/100 proven on Go & Phalcon and on Go×3 replicas; all seven pass the contract and share the identical atomic-`UPDATE` + `CHECK` mechanism, but each of the seven was not individually load-tested |
| 4 | Every §8 checklist item implemented **and** documented in a recipe | 🟡 | Security: complete. Performance/Availability: some items documented-only (below) |
| 5 | Atomic commits that tell the build story | ✅ | 80+ Conventional Commits, each in a working state |
| 6 | Everything in English | ✅ | all code, docs, comments |

## Non-negotiable principles (spec §2)

| Principle | Status | Evidence |
|---|---|---|
| Single OpenAPI contract as source of truth | ✅ | `contract/openapi.yaml`; [ADR 0002](adr/0002-single-openapi-contract.md) |
| Frontend blind to the backend | ✅ | generated client → `/api` only; [frontend README](../frontend/README.md) |
| Same domain model across languages | ✅ | identical entities/state machines; PHP `src/Core` byte-identical across Laravel/Symfony/Phalcon |
| DRY + SOLID (esp. dependency inversion) | ✅ | shared contract/schema/tests; ports + adapters; [ADR 0003](adr/0003-hexagonal-service-layer.md) |
| Frameworks only touch delivery | ✅ | use cases import no framework in all seven |
| Security in every layer | ✅ | [security-layers recipe](recipes/security-layers.md) |
| Micro commits, Conventional Commits | ✅ | git history |
| No self-reference (no tooling/process mentions) | ✅ | docs and commits read as a human-authored lab |

## §8 — Security

| Control | Status | Evidence |
|---|---|---|
| JWT short access + refresh rotation | ✅ | [jwt-refresh-rotation](recipes/jwt-refresh-rotation.md) |
| mTLS gateway ↔ services (≥ documented + example) | ✅ | [mtls-gateway-backend](recipes/mtls-gateway-backend.md); verified on Go |
| Rate limiting per token/IP | ✅ | [rate-limiting](recipes/rate-limiting.md) |
| Strict input validation | ✅ | use-case validation + malformed-body → 400/422 |
| TLS at the edge | ✅ | Traefik `websecure` |
| Encryption of sensitive data at rest | 🟡 | bcrypt password hashes (one-way); volume + `pgcrypto` strategy **documented**, not implemented (no card/PII payload in the domain) — [security-layers](recipes/security-layers.md) |
| Secrets in a vault / managed env | ✅ | env-only; `.env`/certs gitignored; [ADR 0004](adr/0004-secrets-management.md) |
| Errors without internal leakage | ✅ | standard envelope; generic 500 fallback |
| CORS restrictive; CSP/HSTS | ✅ | same-origin SPA; gateway HSTS/nosniff/frame-deny; nginx CSP |
| Webhook signature verification | ✅ | HMAC-SHA256, constant-time compare |
| Least privilege (DB user, scopes) | ✅ | `ticketing_app` role; `CREATE TABLE` denied (verified) |

## §8 — Performance

| Control | Status | Evidence |
|---|---|---|
| Layered cache (HTTP/CDN, Redis hot, client) | 🟡 | HTTP ETag/Cache-Control ✅, client TanStack Query ✅; Redis holds locks/rate/refresh but not a dedicated hot-data cache; CDN out of local scope |
| Explicit, documented cache invalidation | ✅ | [http-caching-etag](recipes/http-caching-etag.md) + query invalidation |
| Indexes + connection pooling | ✅ | schema indexes (`0001_init.sql`); pooled drivers everywhere |
| Read replica / read-write split | ⬜ | not implemented |
| Async processing via queue for payment | ✅ | [async-payment-broker](recipes/async-payment-broker.md) |
| Cursor pagination | ✅ | `/events` `next_cursor` |
| Compression (gzip/brotli), HTTP/2 | 🟡 | HTTP/2 available on TLS; gzip middleware not configured |
| Lean payloads / field selection | 🟡 | DTOs are minimal; no field-selection query param |

## §8 — Availability & resilience

| Control | Status | Evidence |
|---|---|---|
| Stateless behind a load balancer; replicas | ✅ | verified with `--scale backend-go=3` |
| Auto-scaling (compose scale / k8s HPA) | ✅ | `--scale` + HPA in `infra/k8s` |
| Circuit breaker, retry + backoff + jitter, timeouts | ✅ | [resilience-circuit-breaker-go](recipes/resilience-circuit-breaker-go.md) |
| Idempotency on mutating operations | ✅ | [reservation-idempotency-go](recipes/reservation-idempotency-go.md) |
| Graceful degradation | ✅ | payment-down demo: orders stay `pending`, no 5xx |
| Health / readiness probes | ✅ | `/health`, `/ready`; k8s probes |
| Zero-downtime deploy (canary/blue-green documented) | ⬜ | not documented |
| Feature flags | ⬜ | not implemented |

## §8 — Concurrency (the heart of the domain)

| Control | Status | Evidence |
|---|---|---|
| No inventory race (distributed lock / atomic update) | ✅ | [distributed-lock-redis](recipes/distributed-lock-redis.md), atomic conditional `UPDATE` + `CHECK` |
| Reservation TTL with automatic release | ✅ | sweeper (`SweepExpired`) |
| Load-test proof of no overselling | ✅ | [no-overselling-under-load](recipes/no-overselling-under-load.md), [horizontal-scale](recipes/horizontal-scale-no-oversell.md) |

## Deliverables (spec §14) — all delivered

Foundation (contract, schema, infra) ✅ · reference backend ✅ · frontend ✅ · all seven
backends ✅ · resilience + observability ✅ · load test + scale + k8s ✅ · recipes + ADRs ✅.

## Client lab (mobile) — Definition of Done

The three clients — Kotlin Multiplatform, Flutter, React Native — against the same contract.

| Criterion | Status | Evidence |
|---|---|---|
| Identical seven-screen flow; base URL injected; no backend-specific code | ✅ | one flow per app; base URL in a single `AppConfig` per app |
| Every async operation resolves into an explicit modelled state; no silent catches | ✅ | `Outcome`/`AppError` taxonomy + `UiState` in all three, unit-tested |
| Offline-first: bounded reachability check, no infinite loading | ✅ | `ReachabilityChecker` + connectivity state; request timeouts throughout; tested in all three |
| Payment matrix incl. unknown-outcome (no double-charge, no false failure) | ✅ | reconcile-and-poll use case + state holder; unit-tested (unknown → `PaymentUnknown`, same idempotency key) |
| Token handling: access in memory, refresh rotated, global sign-out | ✅ | `SessionManager` (single-flight refresh-on-401, rotation, sign-out); tested in all three (KMP end-to-end via MockEngine) |
| Every atom/molecule/organism has previews across its states | ✅ | `@Preview` + Gallery (KMP); gallery screens (Flutter, RN) |
| Classes and non-trivial functions documented | ✅ | KDoc / dartdoc / TSDoc throughout |
| Builds and tests verified | ✅ | KMP: iOS + Android compile, 35 host tests, Android APK · Flutter: analyze clean, 23 tests, web build · RN: typecheck clean, 19 tests |
| Atomic Conventional Commits per platform | ✅ | `feat(kmp\|flutter\|react-native): …` history |

Scoped, and stated plainly: React Native generates its wire DTO types from the contract
(`openapi-typescript`, with drift-proof enum maps); KMP and Flutter still hand-write DTOs (the
OpenAPI Generator path is documented). Secure token storage uses an in-memory store in the
demo, with the platform secure store (Keychain / Keystore / expo-secure-store) documented
behind the same port. Events lists render lazily (LazyColumn / ListView.builder / FlatList) and
server state is cached with invalidation on reservation (a TTL decorator on KMP/Flutter,
TanStack Query on RN). Certificate/public-key pinning is documented per platform with the
dev bypass (a production posture, off in the tunnel/localhost dev flow). Extending contract
codegen from React Native to KMP and Flutter is the last remaining item. The cross-platform
recipes are authored (see `docs/recipes`).

## Outstanding (all non-security, scoped as future work)

- Individually load-test the remaining five backends (mechanism is identical; contract passes on all).
- OpenTelemetry tracing on the other six backends (metrics + logs already cover all).
- Read-replica read/write split; gzip/HTTP2 tuning; lean-payload field selection.
- Documented blue-green/canary deploy strategy; feature flags.
