<?php

// Lab-specific configuration, read from the environment. See docs/adr/0004.

return [
    'jwt_secret' => env('JWT_SECRET', 'change_me_local_dev_only'),
    'access_ttl' => (int) env('ACCESS_TOKEN_TTL_SECONDS', 900),
    'refresh_ttl' => (int) env('REFRESH_TOKEN_TTL_SECONDS', 1209600),
    'payment_gateway_url' => env('PAYMENT_GATEWAY_URL', 'http://localhost:9090'),
    'payment_webhook_secret' => env('PAYMENT_WEBHOOK_SECRET', 'dev_webhook_secret'),
    'reservation_ttl' => (int) env('RESERVATION_TTL_SECONDS', 120),
    'queue_admit_batch' => (int) env('QUEUE_ADMIT_BATCH', 50),
    'broker_url' => env('BROKER_URL', 'amqp://guest:guest_local_dev_only@localhost:5672/'),
    'redis_url' => env('REDIS_URL', 'redis://localhost:6379/0'),
];
