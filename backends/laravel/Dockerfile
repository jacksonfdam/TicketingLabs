# Multi-stage: install PHP dependencies with Composer, then ship on FrankenPHP (PHP 8.5
# + Caddy in one binary), which serves Laravel with real concurrency.

FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
# Install packages without generating the autoloader: the autoload config classmaps
# app/Core, which is not copied yet. ext-sockets is present in the runtime image
# (php-amqplib needs it) but not in the composer image, so ignore that platform req.
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction \
    --ignore-platform-req=ext-sockets
COPY . .
# Now app/Core exists, so build the optimized autoloader (classmap included).
RUN composer dump-autoload --optimize --no-dev

FROM dunglas/frankenphp:1.12-php8.5
# pdo_pgsql for Postgres, sockets for php-amqplib, pcntl for the worker's signal handling.
RUN install-php-extensions pdo_pgsql sockets pcntl

WORKDIR /app
COPY --from=vendor /app /app

# FrankenPHP serves /app/public; :8080 is unprivileged so it runs fine as non-root.
ENV SERVER_NAME=:8080
# Caddy (inside FrankenPHP) writes its data/config under /data and /config; the app
# writes under storage and bootstrap/cache. Make them writable so the container can run
# as the non-root www-data user.
RUN mkdir -p /data/caddy /config/caddy \
    && chown -R www-data:www-data /data /config storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache
USER www-data

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD php -r "exit(@file_get_contents('http://localhost:8080/health') ? 0 : 1);"
