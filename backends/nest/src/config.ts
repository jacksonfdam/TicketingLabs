// Configuration read entirely from the environment. See docs/adr/0004.

export interface Config {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  brokerUrl: string;
  jwtSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  paymentGatewayUrl: string;
  paymentWebhookSecret: string;
  reservationTtlSeconds: number;
  queueAdmitBatch: number;
}

const envInt = (key: string, def: number): number => {
  const v = process.env[key];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
};

export function loadConfig(): Config {
  return {
    port: envInt('PORT', 8080),
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgres://ticketing_app:app_local_dev_only@localhost:5432/ticketing',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379/0',
    brokerUrl: process.env.BROKER_URL ?? 'amqp://guest:guest_local_dev_only@localhost:5672/',
    jwtSecret: process.env.JWT_SECRET ?? 'change_me_local_dev_only',
    accessTtlSeconds: envInt('ACCESS_TOKEN_TTL_SECONDS', 900),
    refreshTtlSeconds: envInt('REFRESH_TOKEN_TTL_SECONDS', 1209600),
    paymentGatewayUrl: process.env.PAYMENT_GATEWAY_URL ?? 'http://localhost:9090',
    paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev_webhook_secret',
    reservationTtlSeconds: envInt('RESERVATION_TTL_SECONDS', 120),
    queueAdmitBatch: envInt('QUEUE_ADMIT_BATCH', 50),
  };
}
