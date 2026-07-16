// Composition root. Plain manual wiring: construct adapters, inject them into the use
// cases, hand the use cases to the HTTP layer. No DI container; that is the idiomatic
// contrast with the NestJS backend. The dependency arrow is identical, just hand-drawn.

import Redis from 'ioredis';
import { Pool } from 'pg';

import { Broker } from './adapter/broker';
import * as pg from './adapter/postgres';
import { PaymentGatewayClient } from './adapter/paymentgw';
import { RedisAdapter } from './adapter/redis';
import { loadConfig } from './config';
import { BcryptHasher, SystemClock, UuidGenerator } from './platform/services';
import { JwtTokenService } from './platform/token';
import { createApp } from './transport/http';
import {
  AuthService,
  EventService,
  OrderService,
  PaymentService,
  QueueService,
  ReservationService,
  TOPIC_PAYMENT_REQUESTED,
} from './usecase/services';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cfg = loadConfig();

  // --- infrastructure ---
  const pool = new Pool({ connectionString: cfg.databaseUrl });
  const redis = new Redis(cfg.redisUrl);
  const redisAdapter = new RedisAdapter(redis);
  const broker = await Broker.connect(cfg.brokerUrl);
  const gateway = new PaymentGatewayClient(cfg.paymentGatewayUrl);
  const clock = new SystemClock();
  const ids = new UuidGenerator();

  // --- use cases (hand-wired) ---
  const tokens = new JwtTokenService(cfg.jwtSecret, cfg.accessTtlSeconds, cfg.refreshTtlSeconds, redisAdapter, ids, clock);
  const auth = new AuthService(new pg.UsersRepo(pool), new BcryptHasher(), tokens);
  const events = new EventService(new pg.EventsRepo(pool), new pg.SectorsRepo(pool));
  const queue = new QueueService(new pg.QueueRepo(pool), new pg.EventsRepo(pool), redisAdapter, clock, ids, cfg.queueAdmitBatch);
  const reservations = new ReservationService(
    new pg.ReservationsRepo(pool),
    new pg.SectorsRepo(pool),
    redisAdapter,
    queue,
    clock,
    ids,
    cfg.reservationTtlSeconds * 1000,
  );
  const orders = new OrderService(new pg.OrdersRepo(pool), new pg.ReservationsRepo(pool), new pg.SectorsRepo(pool), broker, ids);
  const payments = new PaymentService(
    new pg.OrdersRepo(pool),
    new pg.ReservationsRepo(pool),
    new pg.PaymentsRepo(pool),
    gateway,
    ids,
  );

  const readiness = async (): Promise<Record<string, string>> => {
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
  };

  const app = createApp({ auth, events, queue, reservations, orders, payments, tokens, webhookSecret: cfg.paymentWebhookSecret, readiness });

  // --- background: TTL sweeper ---
  const sweeper = setInterval(() => {
    reservations.sweepExpired(100).catch(() => undefined);
  }, 5000);

  // --- background: async payment worker ---
  await broker.consume(TOPIC_PAYMENT_REQUESTED, async (body) => {
    const { order_id: orderId } = JSON.parse(body.toString('utf8'));
    if (!orderId) return;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(2 ** attempt * 100 + Math.floor(Math.random() * 100));
      try {
        await payments.processPaymentRequest(orderId);
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  });

  const server = app.listen(cfg.port, () => console.log(`listening on :${cfg.port}`));

  const shutdown = async () => {
    clearInterval(sweeper);
    server.close();
    await broker.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
