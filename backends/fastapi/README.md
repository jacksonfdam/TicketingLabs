# FastAPI backend

The second backend, and the one that proves the point. It implements the same
contract as the Go reference and passes the same 16 contract tests, with not a single
change to the tests or the frontend. Different language, different framework, different
async model, identical behaviour.

It follows the same hexagonal shape: thin route handlers, a framework-free use-case
layer, repository ports, injected adapters. If you have read the Go backend, this will
feel familiar on purpose. That familiarity is the deliverable.

## Layout

```
app/domain            entities, enums, errors. Imports nothing from FastAPI or asyncpg.
app/usecase           business rules + Protocol ports. reservation.py is the star.
app/adapter
  postgres.py         repositories over asyncpg
  redis_adp.py        distributed lock, rate limiter, refresh store
  broker.py           RabbitMQ via aio-pika
  paymentgw.py        httpx client for the fake gateway
  memory.py           in-process fakes for unit tests
app/platform          clock, uuid, bcrypt, JWT token service
app/transport/http    DTOs, error envelope + handlers
app/main.py           composition root: app factory, lifespan wiring, sweeper, worker
app/config.py         env-driven configuration
```

## Run it

From the repo root, select this backend and bring the stack up:

```bash
# set COMPOSE_PROFILES=fastapi in .env, then:
make up
# or, one-off without editing .env:
COMPOSE_PROFILES=fastapi docker compose up -d --build
```

The gateway routes `/api` to whichever backend holds the `backend` network alias, so
the API is at `https://localhost/api` regardless of which backend is active.

## Test it

Unit tests, no infrastructure required, including the overselling-under-concurrency
proof (500 concurrent buyers, 100 tickets, exactly 100 succeed):

```bash
cd backends/fastapi
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest
```

The shared contract suite, against the running backend:

```bash
cd contract/tests
TARGET_URL=https://localhost/api pytest -v
```

## Notes that bit us, so they will not bite you

- **asyncpg dislikes `sslmode`.** It is a libpq parameter, not an asyncpg one, so the
  compose `DATABASE_URL` for this backend omits it.
- **`hmac.compare_digest` rejects non-ASCII strings.** The webhook handler catches that
  and treats a junk signature as invalid (401) rather than crashing to 500. The
  contract fuzzer found this; see the commit history.
- **FastAPI's default validation error is a 422 with its own body shape.** We override
  it to the contract's shared 400 envelope so malformed requests stay conformant.
