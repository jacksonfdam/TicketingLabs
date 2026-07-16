# Multi-stage: install PHP dependencies with Composer, then ship on FrankenPHP (PHP 8.5
# + Caddy), which serves Symfony with real concurrency.

FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock symfony.lock ./
# Skip autoloader generation here: the autoload config classmaps src/Core, not copied
# yet. ext-sockets is in the runtime image (php-amqplib) but not the composer image.
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction \
    --ignore-platform-req=ext-sockets
COPY . .
RUN composer dump-autoload --optimize --no-dev

FROM dunglas/frankenphp:1.12-php8.5
RUN install-php-extensions pdo_pgsql sockets pcntl

WORKDIR /app
COPY --from=vendor /app /app

ENV SERVER_NAME=:8080
ENV APP_ENV=prod
# Caddy writes under /data and /config; Symfony writes cache/logs under var/.
RUN mkdir -p /data/caddy /config/caddy var/cache var/log \
    && chown -R www-data:www-data /data /config var \
    && chmod -R 775 var
USER www-data

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD php -r "exit(@file_get_contents('http://localhost:8080/health') ? 0 : 1);"
