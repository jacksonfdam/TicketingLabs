# Laravel backend

The fifth stack, and the first that leaves the Go/Python/JS world entirely. Laravel 13
on PHP 8.5, served by FrankenPHP. It implements the same contract as the other four and
passes the same 16 contract tests, with no change to the tests or the frontend.

The interesting exercise is keeping a famously batteries-included framework at arm's
length. The use cases are plain PHP classes under `app/Core` that import nothing from
Laravel; `CoreServiceProvider` binds the ports to adapters. Laravel does routing,
dependency injection, and HTTP; the domain stays portable. If you have read the other
backends, the shape is identical on purpose.

## Layout

```
app/Core/Domain.php      enums + DomainException + error catalogue (no framework imports)
app/Core/Ports.php       the port interfaces
app/Core/Services.php    the use cases; ReservationService is the star
app/Core/Adapters.php    Postgres (query builder), Redis (predis), RabbitMQ (php-amqplib), gateway (Http)
app/Core/Platform.php    clock, uuid, bcrypt, JWT (firebase/php-jwt)
app/Core/Memory.php      in-process fakes for unit tests
app/Providers/CoreServiceProvider.php   composition root: binds every port to an adapter
app/Http/                request-id + bearer-auth middleware, response DTO mappers
app/Console/Commands/ConsumePayments.php  the async payment worker (php-amqplib consumer)
routes/api.php           the contract as thin closure handlers (mounted at root, apiPrefix '')
```

`app/Core` is autoloaded via a Composer classmap (see `composer.json`), which is why
several classes can share a file without fighting PSR-4.

## Two processes

Laravel runs as two containers from one image: FrankenPHP serving HTTP (it takes the
`backend` network alias) and a queue worker (`php artisan payments:work`) consuming
`payment.requested`. That mirrors how Laravel is actually deployed — web and worker are
separate processes — rather than faking async inside the request.

## Run it

```bash
# set COMPOSE_PROFILES=laravel in .env, then:
make up
# or one-off:
COMPOSE_PROFILES=laravel docker compose up -d --build
```

## Test it

```bash
cd backends/laravel
composer install
php vendor/bin/phpunit tests/Unit        # sequential; see the note below

cd ../../contract/tests
TARGET_URL=https://localhost/api pytest -v   # the shared contract suite
```

## Notes that bit us, so they will not bite you

- **firebase/php-jwt 7 enforces a minimum HMAC key length.** HS256 needs a key of at
  least 256 bits; the lab's old 24-byte dev secret was too short and every login 500'd.
  The other backends' JWT libraries did not enforce this, so it only surfaced here. The
  shared `JWT_SECRET` is now 32+ bytes. That library is right to insist.
- **FrankenPHP (Caddy) writes to `/data` and `/config`.** Running the container as the
  non-root `www-data` user means those must be chowned in the Dockerfile, or Caddy dies
  provisioning its local CA.
- **PHP is single-threaded, so the unit tests are sequential.** They pin the exhaustion,
  idempotency, release, and sweep logic; the true concurrency/overselling proof for this
  backend is the load test hitting the atomic conditional UPDATE in real Postgres.
- **Null and non-string fuzzed inputs.** PHP's typed signatures throw a `TypeError` on a
  `null` where a string is declared, which surfaces as a 500. The route closures cast
  inputs at the edge so malformed bodies become clean 4xx, not crashes.
