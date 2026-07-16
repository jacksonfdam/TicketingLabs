# NestJS backend

The third backend. It implements the same contract as the Go and FastAPI backends and
passes the same 16 contract tests, with no change to the tests or the frontend. NestJS
is the opinionated one: modules, decorators, dependency injection everywhere. The
interesting exercise is keeping the business logic out of all that.

The use cases are plain TypeScript classes that import nothing from NestJS. The module
wires them with `useFactory` from injected adapters. So the framework does delivery and
DI, and the domain stays portable. If you have read the Go or FastAPI backend, the
shape is identical on purpose.

## Layout

```
src/domain            types, enums, errors. Imports nothing from NestJS or pg.
src/usecase           business rules + port interfaces + DI tokens. reservation.service.ts is the star.
src/adapter
  postgres.ts         repositories over node-postgres
  redis.ts            distributed lock, rate limiter, refresh store (ioredis)
  broker.ts           RabbitMQ via amqplib
  paymentgw.ts        fetch client for the fake gateway
  memory.ts           in-process fakes for unit tests
src/platform          clock, uuid, bcrypt, JWT token service
src/transport         DTOs, exception filter (envelope), request-id middleware, auth guard, controllers
src/app.module.ts     composition root: binds every port to an adapter via useFactory
src/main.ts           bootstrap, raw-body capture for webhooks, sweeper, payment worker
```

## Run it

From the repo root, select this backend and bring the stack up:

```bash
# set COMPOSE_PROFILES=nest in .env, then:
make up
# or one-off:
COMPOSE_PROFILES=nest docker compose up -d --build
```

The API is at `https://localhost/api` regardless of which backend is active.

## Test it

Unit tests (no infrastructure), including the overselling-under-concurrency proof:

```bash
cd backends/nest
npm install
npm test
```

The shared contract suite against the running backend:

```bash
cd contract/tests
TARGET_URL=https://localhost/api pytest -v
```

## Notes that bit us, so they will not bite you

- **The `uuid` package's `validate()` is strict about RFC 4122 version/variant bits.**
  It rejects the lab's tidy seed ids like `1111...1111`, which Postgres, Go, and Python
  all accept. Guarding path ids with `validate()` made every lookup 404. We use a
  lenient 8-4-4-4-12 hex shape check instead. The contract fuzzer caught this instantly.
- **NestJS body parsing hides the raw bytes.** Webhook HMAC verification needs the
  exact body, so `main.ts` disables the built-in parser and installs `express.json`
  with a `verify` hook that stashes `rawBody`.
- **NestJS defaults POST to 201.** The contract needs 200 (login/replay), 202 (orders),
  and 204 (release), so handlers set status explicitly with `@HttpCode` or `@Res`.
- **Its default validation error is a 422 with a non-envelope body.** The global
  exception filter maps framework rejections to the contract's shared 400 envelope.
