// The HTTP data layer: config, the error mapper, a ky-based executor and the repository
// implementations. Every failure mode collapses into a typed AppError in one place.

import ky, { KyInstance, TimeoutError } from 'ky';

import { AppError, appError, fail, Logger, noopLogger, ok, Outcome } from '../core/core';
import { EventDetail, EventPage, Order, QueueToken, Reservation, TokenPair } from '../domain/models';
import { AuthRepository, EventRepository, OrderRepository, QueueRepository, ReservationRepository } from '../domain/repositories';
import { SessionManager } from './auth';
import {
  eventDetailFromJson,
  eventPageFromJson,
  MappingError,
  orderFromJson,
  queueTokenFromJson,
  reservationFromJson,
  tokenPairFromJson,
} from './mappers';

/** Everything the app knows about the backend: a base URL and timeouts. Nothing else. */
export interface ApiConfig {
  baseUrl: string;
  requestTimeoutMs?: number;
  maxRetries?: number;
}

/** Maps an HTTP status (and optional error envelope) to a typed error. The one place status
 * codes become taxonomy values. */
export function mapHttpError(status: number, envelope: Record<string, unknown> | null, requestId?: string, retryAfter?: number): AppError {
  const backendCode = typeof envelope?.['code'] === 'string' ? (envelope['code'] as string) : undefined;
  const rid = requestId ?? (typeof envelope?.['request_id'] === 'string' ? (envelope['request_id'] as string) : undefined);
  const cause = backendCode ? `backend code=${backendCode}` : undefined;
  switch (status) {
    case 401:
      return appError('Unauthorized', { requestId: rid, cause });
    case 403:
      return appError('Forbidden', { requestId: rid, cause });
    case 404:
    case 409:
    case 410:
      return appError('Conflict', { requestId: rid, cause, backendCode });
    case 400:
    case 422:
      return appError('Validation', { requestId: rid, cause });
    case 429:
      return appError('RateLimited', { requestId: rid, cause, retryAfterSeconds: retryAfter });
    default:
      if (status >= 500 && status < 600) return appError('ServerError', { requestId: rid, cause, httpStatus: status });
      return appError('Unknown', { requestId: rid, cause: cause ?? `unexpected status ${status}` });
  }
}

/** Builds the configured ky client. `baseUrl` is the only backend knowledge injected. */
export function buildClient(config: ApiConfig): KyInstance {
  const base = config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`;
  return ky.create({
    prefixUrl: base,
    timeout: config.requestTimeoutMs ?? 15000,
    retry: { limit: config.maxRetries ?? 2, methods: ['get', 'post', 'delete'] },
    throwHttpErrors: false,
  });
}

/**
 * Runs one request and collapses every outcome into an Outcome: a 2xx body is parsed (parse
 * failure → MalformedResponse); a non-2xx status goes to mapHttpError; a timeout becomes
 * Timeout; any other transport failure becomes NetworkUnavailable.
 */
export class ApiExecutor {
  constructor(
    private readonly client: KyInstance,
    private readonly logger: Logger = noopLogger,
    private readonly session?: SessionManager,
  ) {}

  async execute<T>(opts: {
    method: 'get' | 'post' | 'delete';
    path: string;
    event: string;
    searchParams?: Record<string, string>;
    json?: unknown;
    idempotencyKey?: string;
    parse: (json: unknown) => T;
  }): Promise<Outcome<T>> {
    // Recomputes headers each call so a retry after refresh carries the rotated token.
    const send = () => {
      const headers: Record<string, string> = {};
      if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
      const token = this.session?.accessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      return this.client(opts.path, { method: opts.method, searchParams: opts.searchParams, json: opts.json, headers });
    };

    try {
      let response = await send();
      // Access token expired: refresh (with rotation) and retry once. A failed refresh signs
      // the session out and the 401 flows on as Unauthorized.
      if (response.status === 401 && this.session && (await this.session.refresh())) {
        response = await send();
      }
      const requestId = response.headers.get('X-Request-Id') ?? undefined;
      if (response.ok) {
        try {
          const body = response.status === 204 ? null : await response.json();
          const value = opts.parse(body);
          this.logger.log('info', opts.event, { requestId });
          return ok(value);
        } catch (e) {
          const cause = e instanceof MappingError ? e.message : `parse: ${String(e)}`;
          return this.failWith(opts.event, appError('MalformedResponse', { requestId, cause }));
        }
      }
      const envelope = await response
        .json<{ error?: Record<string, unknown> }>()
        .then((b) => b.error ?? null)
        .catch(() => null);
      const retryAfter = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
      return this.failWith(opts.event, mapHttpError(response.status, envelope, requestId, Number.isNaN(retryAfter) ? undefined : retryAfter));
    } catch (e) {
      const isTimeout = e instanceof TimeoutError;
      return this.failWith(opts.event, appError(isTimeout ? 'Timeout' : 'NetworkUnavailable', { cause: String(e) }));
    }
  }

  private failWith<T>(event: string, error: AppError): Outcome<T> {
    this.logger.log('error', event, { requestId: error.requestId, errorCode: error.code });
    return fail(error);
  }
}

export class HttpEventRepository implements EventRepository {
  constructor(private readonly api: ApiExecutor) {}
  listEvents(cursor?: string, limit?: number): Promise<Outcome<EventPage>> {
    const searchParams: Record<string, string> = {};
    if (cursor) searchParams.cursor = cursor;
    if (limit) searchParams.limit = String(limit);
    return this.api.execute({ method: 'get', path: 'events', event: 'events.list', searchParams, parse: eventPageFromJson });
  }
  getEvent(id: string): Promise<Outcome<EventDetail>> {
    return this.api.execute({ method: 'get', path: `events/${id}`, event: 'events.detail', parse: eventDetailFromJson });
  }
}

export class HttpQueueRepository implements QueueRepository {
  constructor(private readonly api: ApiExecutor) {}
  join(eventId: string): Promise<Outcome<QueueToken>> {
    return this.api.execute({ method: 'post', path: `events/${eventId}/queue`, event: 'queue.join', parse: queueTokenFromJson });
  }
  status(eventId: string): Promise<Outcome<QueueToken>> {
    return this.api.execute({ method: 'get', path: `events/${eventId}/queue/status`, event: 'queue.status', parse: queueTokenFromJson });
  }
}

export class HttpReservationRepository implements ReservationRepository {
  constructor(private readonly api: ApiExecutor) {}
  create(sectorId: string, quantity: number, idempotencyKey: string): Promise<Outcome<Reservation>> {
    return this.api.execute({
      method: 'post',
      path: 'reservations',
      event: 'reservation.create',
      idempotencyKey,
      json: { sector_id: sectorId, quantity },
      parse: reservationFromJson,
    });
  }
  release(id: string): Promise<Outcome<void>> {
    return this.api.execute({ method: 'delete', path: `reservations/${id}`, event: 'reservation.release', parse: () => undefined });
  }
}

export class HttpOrderRepository implements OrderRepository {
  constructor(private readonly api: ApiExecutor) {}
  create(reservationId: string, idempotencyKey: string): Promise<Outcome<Order>> {
    return this.api.execute({
      method: 'post',
      path: 'orders',
      event: 'order.create',
      idempotencyKey,
      json: { reservation_id: reservationId },
      parse: orderFromJson,
    });
  }
  get(id: string): Promise<Outcome<Order>> {
    return this.api.execute({ method: 'get', path: `orders/${id}`, event: 'order.get', parse: orderFromJson });
  }
}

/** Talks to /auth/login and /auth/refresh. Uses a plain executor with no session: login has
 * no token yet, and refresh must not carry the expired access token or it would recurse. */
export class HttpAuthRepository implements AuthRepository {
  constructor(private readonly api: ApiExecutor) {}
  login(email: string, password: string): Promise<Outcome<TokenPair>> {
    return this.api.execute({ method: 'post', path: 'auth/login', event: 'auth.login', json: { email, password }, parse: tokenPairFromJson });
  }
  refresh(refreshToken: string): Promise<Outcome<TokenPair>> {
    return this.api.execute({ method: 'post', path: 'auth/refresh', event: 'auth.refresh', json: { refresh_token: refreshToken }, parse: tokenPairFromJson });
  }
}
