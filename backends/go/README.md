# Go backend (reference implementation)

The reference backend for the lab. `net/http` and chi for delivery, everything else
built to the same hexagonal shape every other backend follows: thin handlers, a
framework-free service layer, repository ports, and injected adapters.

It is the reference because Go makes the interesting parts legible. The concurrency
primitives are in the language, the error handling is explicit, and there is no
framework magic hiding where the lock is taken or the stock is decremented.

## Layout

```
cmd/server            composition root: wires adapters into use cases (main.go)
internal/domain       entities, enums, errors. Imports nothing from any framework.
internal/usecase      business rules + port interfaces. The reservation logic lives here.
internal/adapter
  postgres            repository ports over pgx
  redisadp            distributed lock, rate limiter, refresh-token store
  broker              RabbitMQ publisher + consumer
  paymentgw           HTTP client for the fake payment gateway
  memory              in-process fakes for unit tests
internal/platform     clock, uuid, bcrypt, JWT token service
internal/transport/http  chi router, middleware, handlers, DTOs, error envelope
internal/config       env-driven configuration
```

The dependency arrow points inward: `transport` and `adapter` depend on `usecase`,
`usecase` depends on `domain`, and `domain` depends on nothing. You can verify this;
`domain` has no third-party imports at all.

## Run it

Part of the full stack (recommended, from the repo root):

```bash
make up                     # brings up Postgres, Redis, RabbitMQ, the fake gateway, this backend, and Traefik
```

The gateway routes `/api` to this backend at the network alias `backend`. Hit it at
`https://localhost/api` (self-signed TLS, so `curl -k`).

## Test it

Unit tests need no infrastructure. They run the real use cases against in-memory
fakes, including the headline overselling-under-concurrency proof:

```bash
cd backends/go
go test ./... -race
```

Contract tests run the shared suite against the running backend:

```bash
cd contract/tests
pip install -r requirements.txt
TARGET_URL=https://localhost/api pytest -v
```

## The interesting file

`internal/usecase/reservation.go`. It is the most concept-dense code in the backend:
idempotency guard, distributed lock, atomic conditional stock decrement, and a TTL
hold, in one method, commented line by line. Start there. See also
`docs/recipes/reservation-idempotency-go.md`.
