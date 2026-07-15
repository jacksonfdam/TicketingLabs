// Composition root. The one module allowed to know about Postgres, Redis, and RabbitMQ
// at once. Every use case is wired with useFactory from plain classes that never import
// NestJS, so the business logic stays framework-free and unit-testable. See ADR 0003.

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';

import { Broker } from './adapter/broker';
import { PaymentGatewayClient } from './adapter/paymentgw';
import {
  EventsRepo,
  OrdersRepo,
  PaymentsRepo,
  QueueRepo,
  ReservationsRepo,
  SectorsRepo,
  UsersRepo,
} from './adapter/postgres';
import { RedisAdapter } from './adapter/redis';
import { Config, loadConfig } from './config';
import { BcryptHasher, SystemClock, UuidGenerator } from './platform/services';
import { JwtTokenService } from './platform/token';
import {
  AuthController,
  EventsController,
  OrdersController,
  QueueController,
  ReservationsController,
  SystemController,
  WebhookController,
} from './transport/controllers';
import { AuthGuard } from './transport/auth.guard';
import { RequestIdMiddleware } from './transport/request-id.middleware';
import { AuthService } from './usecase/auth.service';
import { EventService } from './usecase/events.service';
import { OrderService } from './usecase/order.service';
import { PaymentService } from './usecase/payment.service';
import { QueueService } from './usecase/queue.service';
import { ReservationService } from './usecase/reservation.service';
import { TOKENS } from './usecase/ports';

const T = TOKENS;

@Module({
  controllers: [
    AuthController,
    EventsController,
    QueueController,
    ReservationsController,
    OrdersController,
    WebhookController,
    SystemController,
  ],
  providers: [
    AuthGuard,
    { provide: T.Config, useFactory: loadConfig },

    // --- infrastructure ---
    { provide: 'PG_POOL', useFactory: (cfg: Config) => new Pool({ connectionString: cfg.databaseUrl }), inject: [T.Config] },
    { provide: 'REDIS', useFactory: (cfg: Config) => new Redis(cfg.redisUrl), inject: [T.Config] },
    { provide: 'REDIS_ADAPTER', useFactory: (redis: Redis) => new RedisAdapter(redis), inject: ['REDIS'] },
    { provide: T.Locker, useExisting: 'REDIS_ADAPTER' },
    { provide: T.RateLimiter, useExisting: 'REDIS_ADAPTER' },
    { provide: 'BROKER', useFactory: (cfg: Config) => Broker.connect(cfg.brokerUrl), inject: [T.Config] },
    { provide: T.Publisher, useExisting: 'BROKER' },
    { provide: T.PaymentGateway, useFactory: (cfg: Config) => new PaymentGatewayClient(cfg.paymentGatewayUrl), inject: [T.Config] },

    // --- platform ---
    { provide: T.Clock, useClass: SystemClock },
    { provide: T.IdGenerator, useClass: UuidGenerator },
    { provide: T.PasswordHasher, useClass: BcryptHasher },
    {
      provide: T.TokenService,
      useFactory: (cfg: Config, store: RedisAdapter, ids: UuidGenerator, clock: SystemClock) =>
        new JwtTokenService(cfg.jwtSecret, cfg.accessTtlSeconds, cfg.refreshTtlSeconds, store, ids, clock),
      inject: [T.Config, 'REDIS_ADAPTER', T.IdGenerator, T.Clock],
    },

    // --- repositories ---
    { provide: T.UserRepository, useFactory: (p: Pool) => new UsersRepo(p), inject: ['PG_POOL'] },
    { provide: T.EventRepository, useFactory: (p: Pool) => new EventsRepo(p), inject: ['PG_POOL'] },
    { provide: T.SectorRepository, useFactory: (p: Pool) => new SectorsRepo(p), inject: ['PG_POOL'] },
    { provide: T.QueueRepository, useFactory: (p: Pool) => new QueueRepo(p), inject: ['PG_POOL'] },
    { provide: T.ReservationRepository, useFactory: (p: Pool) => new ReservationsRepo(p), inject: ['PG_POOL'] },
    { provide: T.OrderRepository, useFactory: (p: Pool) => new OrdersRepo(p), inject: ['PG_POOL'] },
    { provide: T.PaymentRepository, useFactory: (p: Pool) => new PaymentsRepo(p), inject: ['PG_POOL'] },

    // --- use cases (plain classes, wired here) ---
    {
      provide: T.AuthService,
      useFactory: (users, hasher, tokens) => new AuthService(users, hasher, tokens),
      inject: [T.UserRepository, T.PasswordHasher, T.TokenService],
    },
    {
      provide: T.EventService,
      useFactory: (events, sectors) => new EventService(events, sectors),
      inject: [T.EventRepository, T.SectorRepository],
    },
    {
      provide: T.QueueService,
      useFactory: (queue, events, limiter, clock, ids, cfg: Config) =>
        new QueueService(queue, events, limiter, clock, ids, cfg.queueAdmitBatch),
      inject: [T.QueueRepository, T.EventRepository, T.RateLimiter, T.Clock, T.IdGenerator, T.Config],
    },
    {
      provide: T.ReservationService,
      useFactory: (reservations, sectors, locker, admission, clock, ids, cfg: Config) =>
        new ReservationService(reservations, sectors, locker, admission, clock, ids, cfg.reservationTtlSeconds * 1000),
      inject: [
        T.ReservationRepository,
        T.SectorRepository,
        T.Locker,
        T.QueueService,
        T.Clock,
        T.IdGenerator,
        T.Config,
      ],
    },
    {
      provide: T.OrderService,
      useFactory: (orders, reservations, sectors, publisher, ids) =>
        new OrderService(orders, reservations, sectors, publisher, ids),
      inject: [T.OrderRepository, T.ReservationRepository, T.SectorRepository, T.Publisher, T.IdGenerator],
    },
    {
      provide: T.PaymentService,
      useFactory: (orders, reservations, payments, gateway, ids) =>
        new PaymentService(orders, reservations, payments, gateway, ids),
      inject: [T.OrderRepository, T.ReservationRepository, T.PaymentRepository, T.PaymentGateway, T.IdGenerator],
    },

    // Readiness probe closure.
    {
      provide: 'READINESS',
      useFactory: (pool: Pool, redis: Redis) => async () => {
        const checks: Record<string, string> = { postgres: 'ok', redis: 'ok' };
        try {
          await pool.query('SELECT 1');
        } catch {
          checks.postgres = 'down';
        }
        try {
          await redis.ping();
        } catch {
          checks.redis = 'down';
        }
        return checks;
      },
      inject: ['PG_POOL', 'REDIS'],
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
