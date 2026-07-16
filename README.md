# Ticketing Labs

One flash-sale ticketing system, implemented in seven backend frameworks, served by a
single frontend that has no idea which backend is answering. It is a teaching lab, not
a product. The goal is to show the same hard problems being solved seven different
ways, and to explain every choice well enough that you could make it yourself.

The domain is a concert going on sale: far more people than tickets, all arriving at
the same second. That one scenario forces everything worth teaching. Stock contention,
distributed locks, idempotency, a virtual queue, asynchronous payment, circuit
breakers, and a load test whose entire job is to try to make you oversell.

## The premise

Three rules the whole repo is built to keep true:

1. **One contract.** `contract/openapi.yaml` is the single source of truth. Every
   backend implements it exactly. See [ADR 0002](docs/adr/0002-single-openapi-contract.md).
2. **The frontend is blind to the backend.** It talks to one gateway. Swapping the
   active backend is a routing change, never a code change. There is no
   `if framework == ...` anywhere, and there never will be.
3. **Frameworks only do delivery.** Business rules live in a framework-agnostic
   service layer. See [ADR 0003](docs/adr/0003-hexagonal-service-layer.md).

## What's built

- **The contract** — one OpenAPI spec (`contract/openapi.yaml`) that every backend
  implements and the frontend generates its client from, plus a shared Postgres schema
  and a contract test suite that runs against any backend.
- **Seven backends**, each a full hexagonal implementation of the contract, each passing
  the same 16 contract tests with zero changes to the suite or the frontend:
  **Go, FastAPI, NestJS, Express, Laravel, Symfony, Phalcon**. Idempotent reservations
  with a distributed lock and atomic stock decrement, TTL holds with a sweeper, async
  payment via RabbitMQ, signed webhooks, JWT with refresh rotation.
- **A frontend** (React + Vite + TS) with a typed client generated from the contract,
  TanStack Query caching, route-level code splitting, in-memory tokens with refresh
  rotation, and the full flow — events → waiting room → reserve with countdown →
  checkout → order polling — verified end-to-end in a browser.
- **Resilience** — circuit breaker + retry/backoff + timeout on the payment path, driven
  live by the fake gateway's runtime failure switch (graceful degradation: orders stay
  `pending`, no 5xx).
- **Observability** — Prometheus + Grafana RED dashboard (edge metrics, works for every
  backend), OpenTelemetry tracing → Tempo (a reservation traces as `POST` →
  `redis.lock.acquire` → `db.decrement_inventory`), Loki + Promtail logs.
- **Scale** — a k6 stampede (`make load`) proving no overselling (100 of 100 seats under
  400 concurrent attempts, 0 over-sold, 0 5xx) on multiple backends and across 3
  replicas sharing one Postgres + Redis; Kubernetes manifests (Deployment, Service, HPA,
  probes, ConfigMap/Secret, Ingress) in `infra/k8s`.
- **Security** — gateway↔backend mutual TLS (worked example, client cert required and
  verified), least-privilege DB role, signed webhooks, rate limiting, strict input
  validation, error envelopes that leak nothing. See the
  [security-layers recipe](docs/recipes/security-layers.md).
- **The recipes** — fourteen concept write-ups in [docs/recipes](docs/recipes/), each
  pointing at real code, plus a README per backend and the ADRs behind the key decisions.

## Quick start

Requires Docker and Docker Compose.

```bash
make up          # copies .env, builds, starts the shared infrastructure
make ps          # see what is running
make down        # stop it
make clean       # stop it and wipe local data
```

After `make up` you get Postgres (migrated and seeded), Redis, RabbitMQ, the fake
payment gateway, the Traefik gateway, and the Go reference backend behind it. The API
is live at `https://localhost/api` (self-signed TLS, so use `curl -k`).

- Web app (the SPA): http://localhost/
- API (via gateway): https://localhost/api/events (also http://localhost/api for local dev)
- RabbitMQ management UI: http://localhost:15672
- Traefik dashboard: http://localhost:8081
- Fake payment gateway health: http://localhost:9090/health

Demo credentials (seeded): `buyer@ticketing.local` / `password123`.

Switch the active backend by editing one line in `.env` — `COMPOSE_PROFILES` is one of
`go`, `fastapi`, `nest`, `express`, `laravel`, `symfony`, `phalcon` — and running
`make up` again. The frontend, gateway, and contract do not change. See
[ADR 0006](docs/adr/0006-backend-switching-via-compose-profiles.md).

```bash
# log in, then list events
curl -sk -XPOST https://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"buyer@ticketing.local","password":"password123"}'
```

For an item-by-item audit of the spec's Definition of Done and the security /
performance / availability / concurrency checklists against the code — proven, partial,
or scoped-future — see [docs/status.md](docs/status.md).

## Repository layout

```
contract/     openapi.yaml (source of truth), db schema + migrations, contract tests
backends/     one directory per framework: go, fastapi, nest, express, laravel, symfony, phalcon
services/     payment-gateway-fake (external provider simulator with a failure switch)
frontend/     React + Vite + TypeScript SPA
infra/        gateway config, k8s manifests, observability, load tests
docs/         architecture.md, domain-model.md, adr/, recipes/
```

## Where to read next

- [docs/architecture.md](docs/architecture.md) — how the pieces fit together.
- [docs/domain-model.md](docs/domain-model.md) — entities, invariants, and the
  reservation/order state machines.
- [docs/adr/](docs/adr/) — why things are the way they are.
- [contract/openapi.yaml](contract/openapi.yaml) — the contract everything obeys.

## License

MIT. See the license field in the contract.
