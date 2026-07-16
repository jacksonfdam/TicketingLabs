# Express backend

The fourth stack, and the deliberate counterpoint to NestJS: same language, opposite
philosophy. No DI container, no decorators, no modules. Plain Express, functions, and a
composition root that wires everything by hand in `main.ts`. It passes the same 16
contract tests as the other three.

Putting Express and NestJS side by side is the whole point. Same domain, same use
cases, same adapters. The only real difference is how the framework is assembled:
NestJS resolves a dependency graph from decorators and tokens; Express is you, calling
`new`, in order, in one file. Neither is wrong. The recipes compare them honestly.

## Layout

```
src/domain            types, enums, errors. Imports nothing framework-y.
src/usecase           ports (plain interfaces) + services.ts (all use cases)
src/adapter           postgres (pg), redis (ioredis), broker (amqplib), paymentgw (fetch), memory
src/platform          clock, uuid, bcrypt, JWT token service
src/transport         dto mappers + http.ts (the whole Express app: middleware, routes, error envelope)
src/main.ts           composition root: hand-wires adapters into use cases, starts sweeper + worker
```

The dependency arrow is identical to every other backend: transport and adapters
depend on use cases, use cases depend on the domain, the domain depends on nothing.
Here the wiring is just visible in one file instead of inferred by a container.

## Run it

```bash
# set COMPOSE_PROFILES=express in .env, then:
make up
# or one-off:
COMPOSE_PROFILES=express docker compose up -d --build
```

## Test it

```bash
cd backends/express
npm install
npm test                       # unit tests, no infrastructure

cd ../../contract/tests
TARGET_URL=https://localhost/api pytest -v   # shared contract suite
```

## Notes

- **No async error swallowing.** Express 4 does not catch errors thrown in async route
  handlers, so every handler is wrapped in a small `wrap()` that forwards rejections to
  the error middleware. Forget it once and a thrown error becomes a hung request.
- **Raw body for webhooks.** `express.json` is configured with a `verify` hook that
  stashes `rawBody`, which the webhook route needs for HMAC verification.
- **Lenient UUID check.** Like the NestJS backend, path/cursor ids are validated with a
  plain 8-4-4-4-12 hex regex, not the `uuid` package's strict RFC 4122 `validate()`,
  which would reject the lab's tidy seed ids.
