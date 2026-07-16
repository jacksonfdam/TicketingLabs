import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import express, { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { DomainError, Errors } from '../domain/errors';
import { TokenService } from '../usecase/ports';
import {
  AuthService,
  EventDetail,
  EventService,
  OrderService,
  PaymentService,
  QueueService,
  ReservationService,
} from '../usecase/services';
import * as dto from './dto';

export interface Deps {
  auth: AuthService;
  events: EventService;
  queue: QueueService;
  reservations: ReservationService;
  orders: OrderService;
  payments: PaymentService;
  tokens: TokenService;
  webhookSecret: string;
  readiness: () => Promise<Record<string, string>>;
}

// Express 4 does not catch errors thrown in async handlers, so every handler is wrapped
// to funnel rejections into the error middleware.
type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

const STATUS: Record<string, number> = {
  [Errors.BadRequest.code]: 400,
  [Errors.InvalidCredentials.code]: 401,
  [Errors.InvalidToken.code]: 401,
  [Errors.Forbidden.code]: 403,
  [Errors.NotAdmitted.code]: 403,
  [Errors.NotFound.code]: 404,
  [Errors.Validation.code]: 422,
  [Errors.InventoryExhausted.code]: 409,
  [Errors.Conflict.code]: 409,
  [Errors.ReservationState.code]: 409,
  [Errors.RateLimited.code]: 429,
  [Errors.LockUnavailable.code]: 429,
  [Errors.Internal.code]: 500,
};

const requestId = (req: Request): string => (req as Request & { requestId: string }).requestId;
const userId = (req: Request): string => (req as Request & { userId: string }).userId;
// Express 5 types route params as string | string[]; our routes always have a single
// :id, so coerce to a plain string at the edge.
const idParam = (req: Request): string => String(req.params.id);

export function createApp(deps: Deps): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // Capture the raw body for webhook HMAC verification while still parsing JSON.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request & { rawBody: Buffer }).rawBody = buf;
      },
    }),
  );

  // Request id on every request and response.
  app.use((req: Request & { requestId?: string }, res: Response, next: NextFunction) => {
    const id = (req.headers['x-request-id'] as string) || uuidv4();
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

  const requireAuth = (req: Request & { userId?: string }, _res: Response, next: NextFunction) => {
    const auth = req.headers['authorization'] ?? '';
    if (!auth.startsWith('Bearer ')) return next(Errors.InvalidToken);
    try {
      req.userId = deps.tokens.parseAccess(auth.slice('Bearer '.length)).userId;
      next();
    } catch (err) {
      next(err);
    }
  };

  // --- system ---
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get(
    '/ready',
    wrap(async (_req, res) => {
      const checks = await deps.readiness();
      const ok = Object.values(checks).every((v) => v === 'ok');
      res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
    }),
  );

  // --- auth ---
  app.post(
    '/auth/login',
    wrap(async (req, res) => {
      const { email, password } = req.body ?? {};
      res.status(200).json(dto.tokenPairDto(await deps.auth.login(email ?? '', password ?? '')));
    }),
  );
  app.post(
    '/auth/refresh',
    wrap(async (req, res) => {
      res.status(200).json(dto.tokenPairDto(await deps.auth.refresh(req.body?.refresh_token ?? '')));
    }),
  );

  // --- events ---
  app.get(
    '/events',
    wrap(async (req, res) => {
      const cursor = (req.query.cursor as string) ?? '';
      const n = parseInt((req.query.limit as string) ?? '20', 10);
      const { events, nextCursor } = await deps.events.list(cursor, Number.isFinite(n) ? n : 20);
      res.setHeader('Cache-Control', 'public, max-age=30').json(dto.eventPageDto(events, nextCursor));
    }),
  );
  app.get(
    '/events/:id',
    wrap(async (req, res) => {
      const detail = await deps.events.get(idParam(req));
      const etag = weakEtag(detail);
      if (req.headers['if-none-match'] === etag) {
        res.setHeader('ETag', etag).status(304).end();
        return;
      }
      res.setHeader('ETag', etag).setHeader('Cache-Control', 'public, max-age=5').json(dto.eventDetailDto(detail));
    }),
  );

  // --- queue ---
  app.post(
    '/events/:id/queue',
    requireAuth,
    wrap(async (req, res) => {
      res.status(201).json(dto.queueTokenDto(await deps.queue.join(userId(req), idParam(req))));
    }),
  );
  app.get(
    '/events/:id/queue/status',
    requireAuth,
    wrap(async (req, res) => {
      res.json(dto.queueTokenDto(await deps.queue.status(userId(req), idParam(req))));
    }),
  );

  // --- reservations ---
  app.post(
    '/reservations',
    requireAuth,
    wrap(async (req, res) => {
      const idemKey = req.headers['idempotency-key'] as string | undefined;
      if (!idemKey) throw Errors.Validation;
      const { sector_id, quantity } = req.body ?? {};
      const result = await deps.reservations.create(userId(req), sector_id ?? '', quantity ?? 0, idemKey);
      // 201 for a fresh hold, 200 for an idempotent replay. The contract distinguishes.
      res.status(result.replayed ? 200 : 201).json(dto.reservationDto(result.reservation));
    }),
  );
  app.delete(
    '/reservations/:id',
    requireAuth,
    wrap(async (req, res) => {
      await deps.reservations.release(userId(req), idParam(req));
      res.status(204).end();
    }),
  );

  // --- orders ---
  app.post(
    '/orders',
    requireAuth,
    wrap(async (req, res) => {
      const idemKey = req.headers['idempotency-key'] as string | undefined;
      if (!idemKey) throw Errors.Validation;
      const order = await deps.orders.create(userId(req), req.body?.reservation_id ?? '', idemKey);
      res.status(202).json(dto.orderDto(order));
    }),
  );
  app.get(
    '/orders/:id',
    requireAuth,
    wrap(async (req, res) => {
      res.json(dto.orderDto(await deps.orders.get(idParam(req))));
    }),
  );

  // --- webhook ---
  app.post(
    '/webhooks/payment',
    wrap(async (req, res) => {
      const raw: Buffer = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from('');
      const signature = (req.headers['x-signature'] as string) ?? '';
      if (!validSignature(deps.webhookSecret, signature, raw)) throw Errors.InvalidToken;
      let data: { provider_ref?: string; order_id?: string; status?: string };
      try {
        data = JSON.parse(raw.toString('utf8'));
      } catch {
        throw Errors.Validation;
      }
      await deps.payments.handleWebhook(data.provider_ref ?? '', data.order_id ?? '', data.status === 'succeeded');
      res.json({ status: 'ok' });
    }),
  );

  // Unknown route -> not found, in the standard envelope.
  app.use((_req, _res, next) => next(Errors.NotFound));

  // Error envelope. Domain errors map to their status; a body-parser SyntaxError is a
  // malformed request (400); anything else is a generic 500. Internal detail never
  // reaches the client.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    let de: DomainError;
    const status400 = typeof err === 'object' && err !== null && (err as { status?: number }).status === 400;
    if (err instanceof DomainError) de = err;
    else if (err instanceof SyntaxError || status400) de = Errors.BadRequest; // malformed body / params
    else de = Errors.Internal;
    const status = STATUS[de.code] ?? 500;
    res.setHeader('X-Request-Id', requestId(req) ?? '');
    res.status(status).json({ error: { code: de.code, message: de.publicMessage, request_id: requestId(req) ?? '' } });
  });

  return app;
}

function weakEtag(d: EventDetail): string {
  const h = createHash('sha256');
  h.update(`${d.event.id}:${d.event.status}`);
  for (const s of d.sectors) h.update(`|${s.id}:${s.availableInventory}`);
  return `W/"${h.digest('hex').slice(0, 16)}"`;
}

function validSignature(secret: string, signature: string, body: Buffer): boolean {
  const want = createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
