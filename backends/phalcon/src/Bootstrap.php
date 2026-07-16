<?php

// The composition root, hand-wired. Phalcon Micro apps are close to the metal, so the
// dependency graph is built explicitly here and shared by public/index.php (HTTP) and
// bin/worker.php (the payment worker). Same inward-pointing arrow as every other
// backend, just assembled by hand. See ADR 0003.

declare(strict_types=1);

namespace App;

use App\Adapter\Broker;
use App\Adapter\CurlPaymentGateway;
use App\Adapter\PhalconEventRepository;
use App\Adapter\PhalconOrderRepository;
use App\Adapter\PhalconPaymentRepository;
use App\Adapter\PhalconQueueRepository;
use App\Adapter\PhalconReservationRepository;
use App\Adapter\PhalconSectorRepository;
use App\Adapter\PhalconUserRepository;
use App\Adapter\RedisAdapter;
use App\Platform\BcryptHasher;
use App\Platform\DbFactory;
use App\Platform\JwtTokenService;
use App\Platform\RedisFactory;
use App\Platform\SystemClock;
use App\Platform\UuidGenerator;
use App\UseCase\AuthService;
use App\UseCase\EventService;
use App\UseCase\OrderService;
use App\UseCase\PaymentService;
use App\UseCase\QueueService;
use App\UseCase\ReservationService;

final class Bootstrap
{
    private static function intEnv(string $key, int $default): int
    {
        $v = getenv($key);
        return $v === false || $v === '' ? $default : (int) $v;
    }

    public static function build(): object
    {
        $db = DbFactory::fromEnv();
        $redis = new RedisAdapter(RedisFactory::fromEnv());
        $broker = new Broker(getenv('BROKER_URL') ?: 'amqp://guest:guest@localhost:5672/');
        $gateway = new CurlPaymentGateway(getenv('PAYMENT_GATEWAY_URL') ?: 'http://localhost:9090');
        $clock = new SystemClock();
        $ids = new UuidGenerator();

        $tokens = new JwtTokenService(
            getenv('JWT_SECRET') ?: 'change_me',
            self::intEnv('ACCESS_TOKEN_TTL_SECONDS', 900),
            self::intEnv('REFRESH_TOKEN_TTL_SECONDS', 1209600),
            $redis, $ids, $clock,
        );

        $users = new PhalconUserRepository($db);
        $events = new PhalconEventRepository($db);
        $sectors = new PhalconSectorRepository($db);
        $queueRepo = new PhalconQueueRepository($db);
        $reservationsRepo = new PhalconReservationRepository($db);
        $ordersRepo = new PhalconOrderRepository($db);
        $paymentsRepo = new PhalconPaymentRepository($db);

        $queue = new QueueService($queueRepo, $events, $redis, $clock, $ids, self::intEnv('QUEUE_ADMIT_BATCH', 50));

        return (object) [
            'db' => $db,
            'redis' => $redis,
            'broker' => $broker,
            'tokens' => $tokens,
            'auth' => new AuthService($users, new BcryptHasher(), $tokens),
            'events' => new EventService($events, $sectors),
            'queue' => $queue,
            'reservations' => new ReservationService($reservationsRepo, $sectors, $redis, $queue, $clock, $ids, self::intEnv('RESERVATION_TTL_SECONDS', 120)),
            'orders' => new OrderService($ordersRepo, $reservationsRepo, $sectors, $broker, $ids),
            'payments' => new PaymentService($ordersRepo, $reservationsRepo, $paymentsRepo, $gateway, $ids),
            'webhookSecret' => getenv('PAYMENT_WEBHOOK_SECRET') ?: 'dev_webhook_secret',
        ];
    }
}
