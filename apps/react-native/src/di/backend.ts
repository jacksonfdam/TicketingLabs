// The composition root's dependency graph: demo (in-memory) or real (HTTP + session).

import { AppConfig } from '../config/appConfig';
import {
  ApiExecutor,
  buildClient,
  HttpAuthRepository,
  HttpEventRepository,
  HttpOrderRepository,
  HttpQueueRepository,
  HttpReservationRepository,
} from '../data/api';
import { SessionManager } from '../data/auth';
import { SecureTokenStore } from '../data/secureTokenStore';
import {
  DemoEventRepository,
  DemoIdempotencyKeyFactory,
  DemoOrderRepository,
  DemoQueueRepository,
  DemoReservationRepository,
} from '../demo/demo';
import { EventRepository, IdempotencyKeyFactory, OrderRepository, QueueRepository, ReservationRepository } from '../domain/repositories';

/** `session` is null in demo mode (no auth); the app shows the login screen only when a real
 * SessionManager is present and has no token. */
export interface Backend {
  eventRepo: EventRepository;
  queue: QueueRepository;
  reservations: ReservationRepository;
  orders: OrderRepository;
  keys: IdempotencyKeyFactory;
  session: SessionManager | null;
  /** Restores a persisted session into memory on startup, resolving true when one was found (so
   * the app can skip login). Absent in demo mode. Bounded by a local secure-store read. */
  hydrateSession?: () => Promise<boolean>;
}

/** In-memory data, no auth. Runs with no backend. */
export function demoBackend(): Backend {
  return {
    eventRepo: new DemoEventRepository(),
    queue: new DemoQueueRepository(),
    reservations: new DemoReservationRepository(),
    orders: new DemoOrderRepository(),
    keys: new DemoIdempotencyKeyFactory(),
    session: null,
  };
}

/** Real HTTP repositories against the gateway, with a session and refresh rotation. */
export function realBackend(): Backend {
  const config = { baseUrl: AppConfig.baseUrl };
  // Auth calls go through a session-less executor so refresh does not carry a stale token.
  const authExecutor = new ApiExecutor(buildClient(config));
  const store = new SecureTokenStore();
  const session = new SessionManager(store, new HttpAuthRepository(authExecutor));
  const executor = new ApiExecutor(buildClient(config), undefined, session);
  return {
    eventRepo: new HttpEventRepository(executor),
    queue: new HttpQueueRepository(executor),
    reservations: new HttpReservationRepository(executor),
    orders: new HttpOrderRepository(executor),
    keys: new UuidKeys(),
    session,
    hydrateSession: () => store.hydrate(),
  };
}

class UuidKeys implements IdempotencyKeyFactory {
  newKey(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
  }
}
