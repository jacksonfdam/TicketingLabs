<?php

declare(strict_types=1);

namespace App\Providers;

use App\Adapter\Broker;
use App\Adapter\HttpPaymentGateway;
use App\Adapter\PgEventRepository;
use App\Adapter\PgOrderRepository;
use App\Adapter\PgPaymentRepository;
use App\Adapter\PgQueueRepository;
use App\Adapter\PgReservationRepository;
use App\Adapter\PgSectorRepository;
use App\Adapter\PgUserRepository;
use App\Adapter\RedisAdapter;
use App\Platform\BcryptHasher;
use App\Platform\JwtTokenService;
use App\Platform\SystemClock;
use App\Platform\UuidGenerator;
use App\UseCase\AdmissionChecker;
use App\UseCase\AuthService;
use App\UseCase\Clock;
use App\UseCase\EventRepository;
use App\UseCase\EventService;
use App\UseCase\IdGenerator;
use App\UseCase\Locker;
use App\UseCase\OrderRepository;
use App\UseCase\OrderService;
use App\UseCase\PasswordHasher;
use App\UseCase\PaymentGateway;
use App\UseCase\PaymentRepository;
use App\UseCase\PaymentService;
use App\UseCase\Publisher;
use App\UseCase\QueueRepository;
use App\UseCase\QueueService;
use App\UseCase\RateLimiter;
use App\UseCase\ReservationRepository;
use App\UseCase\ReservationService;
use App\UseCase\SectorRepository;
use App\UseCase\TokenService;
use App\UseCase\UserRepository;
use Illuminate\Support\ServiceProvider;
use Predis\Client as Predis;

// The composition root. This is the one place that knows about Postgres, Redis, and
// RabbitMQ at once. It binds every port to a concrete adapter; the use cases (bound
// below) depend only on the port interfaces. See ADR 0003.
final class CoreServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // --- infrastructure ---
        $this->app->singleton(RedisAdapter::class, function () {
            $p = parse_url((string) config('ticketing.redis_url'));
            $client = new Predis('tcp://'.($p['host'] ?? 'localhost').':'.($p['port'] ?? 6379));
            return new RedisAdapter($client);
        });
        $this->app->bind(Locker::class, RedisAdapter::class);
        $this->app->bind(RateLimiter::class, RedisAdapter::class);
        $this->app->singleton(Broker::class, fn () => new Broker((string) config('ticketing.broker_url')));
        $this->app->bind(Publisher::class, Broker::class);
        $this->app->bind(PaymentGateway::class, fn () => new HttpPaymentGateway((string) config('ticketing.payment_gateway_url')));

        // --- platform ---
        $this->app->bind(Clock::class, SystemClock::class);
        $this->app->bind(IdGenerator::class, UuidGenerator::class);
        $this->app->bind(PasswordHasher::class, BcryptHasher::class);
        $this->app->singleton(TokenService::class, fn ($app) => new JwtTokenService(
            (string) config('ticketing.jwt_secret'),
            (int) config('ticketing.access_ttl'),
            (int) config('ticketing.refresh_ttl'),
            $app->make(RedisAdapter::class),
            $app->make(IdGenerator::class),
            $app->make(Clock::class),
        ));

        // --- repositories (ports -> Postgres adapters) ---
        $this->app->bind(UserRepository::class, PgUserRepository::class);
        $this->app->bind(EventRepository::class, PgEventRepository::class);
        $this->app->bind(SectorRepository::class, PgSectorRepository::class);
        $this->app->bind(QueueRepository::class, PgQueueRepository::class);
        $this->app->bind(ReservationRepository::class, PgReservationRepository::class);
        $this->app->bind(OrderRepository::class, PgOrderRepository::class);
        $this->app->bind(PaymentRepository::class, PgPaymentRepository::class);

        // --- use cases ---
        $this->app->bind(AuthService::class, fn ($app) => new AuthService(
            $app->make(UserRepository::class), $app->make(PasswordHasher::class), $app->make(TokenService::class),
        ));
        $this->app->bind(EventService::class, fn ($app) => new EventService(
            $app->make(EventRepository::class), $app->make(SectorRepository::class),
        ));
        $this->app->singleton(QueueService::class, fn ($app) => new QueueService(
            $app->make(QueueRepository::class), $app->make(EventRepository::class), $app->make(RateLimiter::class),
            $app->make(Clock::class), $app->make(IdGenerator::class), (int) config('ticketing.queue_admit_batch'),
        ));
        $this->app->bind(AdmissionChecker::class, QueueService::class);
        $this->app->bind(ReservationService::class, fn ($app) => new ReservationService(
            $app->make(ReservationRepository::class), $app->make(SectorRepository::class), $app->make(Locker::class),
            $app->make(AdmissionChecker::class), $app->make(Clock::class), $app->make(IdGenerator::class),
            (int) config('ticketing.reservation_ttl'),
        ));
        $this->app->bind(OrderService::class, fn ($app) => new OrderService(
            $app->make(OrderRepository::class), $app->make(ReservationRepository::class), $app->make(SectorRepository::class),
            $app->make(Publisher::class), $app->make(IdGenerator::class),
        ));
        $this->app->bind(PaymentService::class, fn ($app) => new PaymentService(
            $app->make(OrderRepository::class), $app->make(ReservationRepository::class), $app->make(PaymentRepository::class),
            $app->make(PaymentGateway::class), $app->make(IdGenerator::class),
        ));
    }
}
