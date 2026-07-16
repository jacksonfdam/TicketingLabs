# Symfony backend

The sixth stack, and the second in PHP. Symfony 8.1 on PHP 8.5, served by FrankenPHP.
It implements the same contract as the other five and passes the same 16 contract tests.

Symfony is the interesting counterpoint to Laravel: same language, opposite temperament.
Where Laravel leans on conventions and facades, Symfony wants explicit configuration.
The composition root here is `config/services.yaml` — every port aliased to an adapter,
every use case wired with its dependencies and scalar config, by hand. Put next to
Laravel's `CoreServiceProvider` closures and NestJS's decorator graph, the three make
the same dependency-injection idea legible three different ways.

The framework-free core (`src/Core/Domain.php`, `Ports.php`, `Services.php`, `Memory.php`)
is byte-identical to the Laravel backend's — because it is pure PHP that imports nothing
from either framework. That is the point: only the edges differ.

## Layout

```
src/Core/                domain, ports, use cases, memory fakes (classmap-autoloaded, framework-free)
src/Core/Adapters.php    Postgres (Doctrine DBAL), Redis (predis), RabbitMQ (php-amqplib), gateway (HttpClient)
src/Core/Platform.php    clock, uuid, bcrypt, JWT, + DBAL/Redis factories
src/Controller/ApiController.php   the contract as thin actions (attribute routing, mounted at root)
src/Support/             Dto mappers, Authenticator (bearer -> user id)
src/EventSubscriber/     request-id + exception-envelope subscribers
src/Command/ConsumePaymentsCommand.php   the async payment worker
config/services.yaml     the composition root: ports -> adapters, use cases wired explicitly
```

## Two processes

Like Laravel, Symfony runs as two containers from one image: FrankenPHP serving HTTP
(it takes the `backend` network alias) and a console worker (`bin/console
app:payments:work`) consuming `payment.requested`.

## Run it

```bash
# set COMPOSE_PROFILES=symfony in .env, then:
make up
# or one-off:
COMPOSE_PROFILES=symfony docker compose up -d --build
```

## Test it

```bash
cd backends/symfony
composer install
php bin/phpunit tests/Unit          # sequential unit tests

cd ../../contract/tests
TARGET_URL=https://localhost/api pytest -v   # the shared contract suite
```

## Notes that bit us, so they will not bite you

- **Doctrine DBAL 4 removed URL parsing.** `DriverManager::getConnection(['url' => ...])`
  no longer works; you parse the DSN with `Doctrine\DBAL\Tools\DsnParser` into discrete
  params first. `DbFactory` does exactly that.
- **The routing recipe needs `DEFAULT_URI`.** Symfony's router wants a default URI for
  URL generation outside an HTTP request (the worker). It has no fallback, so it is set
  in the environment.
- **The grouped `src/Core` files use a Composer classmap**, and `config/services.yaml`
  excludes `src/Core` from autowiring, wiring those services explicitly instead. Symfony
  would otherwise try to register enums and interfaces as services and fail.
- **FrankenPHP as non-root** needs `/data`, `/config`, and Symfony's `var/` writable;
  the Dockerfile chowns them to `www-data`.
