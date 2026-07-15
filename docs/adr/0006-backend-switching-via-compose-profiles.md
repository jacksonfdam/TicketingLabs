# 6. Switch the active backend with a Docker Compose profile

Date: 2026-07-16

## Status

Accepted

## Context

The lab's central claim is that the frontend does not know or care which backend
answers. With one backend that claim is untested. With two, we need a mechanism to
choose which one runs, and the mechanism itself must not violate the claim: switching
backends cannot mean editing the frontend, the gateway config, or the contract.

## Decision

Each backend is a Compose service behind a profile named after it (`go`, `fastapi`,
and more to come). Every backend registers the same Docker network alias, `backend`.
The gateway routes `/api` to `backend`, always. Exactly one backend runs at a time,
selected by `COMPOSE_PROFILES` in `.env`, which Compose reads automatically.

Switching backends is one line:

```bash
# .env
COMPOSE_PROFILES=fastapi
```

The shared infrastructure services (Postgres, Redis, RabbitMQ, the gateway, the fake
payment gateway) carry no profile, so they always run regardless of which backend is
selected.

## Consequences

- Switching the active backend touches exactly one variable. The frontend, the gateway
  configuration, and the contract are untouched, which is the property the whole lab
  exists to demonstrate, now mechanised.
- Because both backends answer to the same alias and share the same database, they are
  hot-swappable against a running dataset. State persists across a swap.
- Only one backend runs at a time locally. Running several at once for comparison would
  need distinct aliases and a gateway routing rule per backend; that is a later
  refinement if we want side-by-side benchmarking.
- The contract test suite is the referee. A new backend is "done" when
  `TARGET_URL=https://localhost/api pytest` is green against it, exactly as it is for
  the others.
