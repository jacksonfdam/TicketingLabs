import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { json } from 'express';

import { Broker } from './adapter/broker';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { EnvelopeFilter } from './transport/envelope.filter';
import { PaymentService } from './usecase/payment.service';
import { ReservationService } from './usecase/reservation.service';
import { TOKENS } from './usecase/ports';
import { TOPIC_PAYMENT_REQUESTED } from './usecase/order.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bootstrap() {
  const cfg = loadConfig();
  // Disable Nest's built-in parser so we can capture the raw body for webhook HMAC
  // verification while still populating req.body for @Body().
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(
    json({
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody: Buffer }).rawBody = buf;
      },
    }),
  );
  app.useGlobalFilters(new EnvelopeFilter());
  app.enableShutdownHooks();

  await app.init();

  // --- background: TTL sweeper ---
  const reservations = app.get<ReservationService>(TOKENS.ReservationService);
  const sweeper = setInterval(() => {
    reservations.sweepExpired(100).catch(() => undefined);
  }, 5000);

  // --- background: async payment worker ---
  const broker = app.get<Broker>('BROKER');
  const payments = app.get<PaymentService>(TOKENS.PaymentService);
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

  const shutdown = async () => {
    clearInterval(sweeper);
    await broker.close().catch(() => undefined);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen(cfg.port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`listening on :${cfg.port}`);
}

bootstrap();
