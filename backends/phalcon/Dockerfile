# Multi-stage: install PHP dependencies with Composer, then ship on FrankenPHP with the
# Phalcon C extension. Phalcon supports PHP 8.4 (8.5 support is still in progress), so
# this backend pins the FrankenPHP 8.4 image — the latest Phalcon-supported, secure PHP.

FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
# Skip autoloader here (classmap points at src/Core, not copied yet). Phalcon and
# sockets are compiled into the runtime image, not the composer image.
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction \
    --ignore-platform-req=ext-phalcon --ignore-platform-req=ext-sockets
COPY . .
RUN composer dump-autoload --optimize --no-dev --ignore-platform-req=ext-phalcon --ignore-platform-req=ext-sockets

FROM dunglas/frankenphp:1.12-php8.4
RUN install-php-extensions phalcon pdo_pgsql sockets pcntl

WORKDIR /app
COPY --from=vendor /app /app

ENV SERVER_NAME=:8080
RUN mkdir -p /data/caddy /config/caddy && chown -R www-data:www-data /data /config
USER www-data

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD php -r "exit(@file_get_contents('http://localhost:8080/health') ? 0 : 1);"
