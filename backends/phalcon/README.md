# Phalcon backend

The seventh and final backend, completing the polyglot set. Phalcon 5.16 on PHP 8.4,
served by FrankenPHP. It implements the same contract as the other six and passes the
same 16 contract tests.

Phalcon is the outlier: it is not a Composer library but a PHP **C extension**. The
framework lives in compiled code loaded as `ext-phalcon`, which is why the Dockerfile
installs it with `install-php-extensions phalcon` rather than pulling it via Composer.
The application here is a `Phalcon\Mvc\Micro` app — minimal, close to the metal, with
the dependency graph wired entirely by hand in `src/Bootstrap.php`. Where Symfony makes
you configure everything and Laravel hides it behind conventions, Phalcon Micro just
hands you the request and gets out of the way.

The framework-free core (`src/Core/Domain.php`, `Ports.php`, `Services.php`, `Memory.php`)
is byte-identical to the Laravel and Symfony backends'. Only the edges differ:
`Phalcon\Db` for persistence, `Phalcon\Mvc\Micro` for routing.

## Why PHP 8.4, not 8.5

Phalcon's C extension has to be compiled for each PHP version, and its stable build
targets PHP 8.4 (8.5 support is still in progress at time of writing). So this backend
pins the FrankenPHP 8.4 image — the latest Phalcon-supported, fully-secure PHP. The
other backends stay on 8.5; the lab does not force a single version where a dependency
genuinely constrains it.

## Layout

```
src/Core/                domain, ports, use cases, memory fakes (classmap, framework-free)
src/Core/Adapters.php    Postgres (Phalcon\Db), Redis (predis), RabbitMQ (php-amqplib), gateway (curl)
src/Core/Platform.php    clock, uuid, bcrypt, JWT, + DB/Redis factories
src/Bootstrap.php        the hand-wired composition root, shared by web and worker
src/Http/Dto.php         response mappers
public/index.php         the Micro app: routes, request-id, error envelope
bin/worker.php           the async payment worker (php-amqplib consumer)
```

## Run it

```bash
# set COMPOSE_PROFILES=phalcon in .env, then:
make up
# or one-off:
COMPOSE_PROFILES=phalcon docker compose up -d --build
```

## Test it

```bash
cd backends/phalcon
composer install --ignore-platform-req=ext-phalcon   # ext lives in the runtime image
php vendor/bin/phpunit                                # sequential unit tests

cd ../../contract/tests
TARGET_URL=https://localhost/api pytest -v            # the shared contract suite
```

## Notes that bit us, so they will not bite you

- **Phalcon is an extension, not a package.** `composer install` needs
  `--ignore-platform-req=ext-phalcon` outside the runtime image; the extension is
  compiled into the FrankenPHP image with `install-php-extensions phalcon`.
- **Phalcon Micro auto-sends a returned Response.** Calling `$response->send()` again
  afterwards throws `ResponseAlreadySent`; the front controller guards the final send
  with `isSent()` so only the error paths (thrown out of `handle()`) send explicitly.
- **The DB factory reads discrete `DB_*` vars**, because `Phalcon\Db\Adapter\Pdo\Postgresql`
  takes a params array, not a URL.
