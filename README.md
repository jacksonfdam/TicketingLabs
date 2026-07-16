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

## Status

Built in phases. Right now:

- [x] **Phase 0 — Foundation.** Contract, domain model, database schema, shared
      infrastructure (Postgres, Redis, RabbitMQ, Traefik, fake payment gateway),
      executable contract-test scaffold.
- [x] **Phase 1 — Reference backend** (Go). Full hexagonal implementation of the
      contract: idempotent reservations with a distributed lock and atomic stock
      decrement, TTL holds with a sweeper, async payment via RabbitMQ, signed
      webhooks, JWT with refresh rotation. Passes the full contract suite (16 tests)
      and a 500-buyers-vs-100-tickets overselling proof under `-race`.
- [ ] **Phase 2 — Frontend** (React + Vite + TS), generated client, cache and
      security practices.
- [~] **Phase 3 — The other backends**, each passing the same contract tests.
      **FastAPI**, **NestJS**, and **Express** are done (same 16 tests, zero changes to
      the suite or frontend). Remaining: Laravel, Symfony, Phalcon.
- [ ] **Phase 4 — Resilience and observability**, live failure injection, dashboards,
      distributed tracing.
- [ ] **Phase 5 — Scale**, load tests proving no overselling, horizontal scaling,
      Kubernetes manifests.
- [ ] **Phase 6 — Recipes**, one per concept per backend.

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

- API (via gateway): https://localhost/api/events
- RabbitMQ management UI: http://localhost:15672
- Traefik dashboard: http://localhost:8081
- Fake payment gateway health: http://localhost:9090/health

Demo credentials (seeded): `buyer@ticketing.local` / `password123`.

Switch the active backend by editing one line in `.env` (`COMPOSE_PROFILES=go`,
`fastapi`, `nest`, or `express`) and running `make up` again. The frontend, gateway,
and contract do not change. See
[ADR 0006](docs/adr/0006-backend-switching-via-compose-profiles.md).

```bash
# log in, then list events
curl -sk -XPOST https://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"buyer@ticketing.local","password":"password123"}'
```

## Repository layout

```
contract/     openapi.yaml (source of truth), db schema + migrations, contract tests
backends/     one directory per framework: go, fastapi, nest, express, laravel, symfony, phalcon
services/     payment-gateway-fake (external provider simulator with a failure switch)
frontend/     React + Vite + TypeScript SPA (Phase 2)
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

MIT. See the license field in the contract; a full `LICENSE` file lands with Phase 6.
