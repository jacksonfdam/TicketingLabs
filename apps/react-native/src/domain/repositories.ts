// Repository ports: the boundary between business logic and the outside world. Use cases
// depend on these interfaces, never on the HTTP client.

import { Outcome } from '../core/core';
import { EventDetail, EventPage, Order, QueueToken, Reservation, TokenPair } from './models';

export interface EventRepository {
  listEvents(cursor?: string, limit?: number): Promise<Outcome<EventPage>>;
  getEvent(id: string): Promise<Outcome<EventDetail>>;
}

export interface QueueRepository {
  join(eventId: string): Promise<Outcome<QueueToken>>;
  status(eventId: string): Promise<Outcome<QueueToken>>;
}

export interface ReservationRepository {
  /** Creates a hold. `idempotencyKey` makes a retried create a no-op. */
  create(sectorId: string, quantity: number, idempotencyKey: string): Promise<Outcome<Reservation>>;
  release(id: string): Promise<Outcome<void>>;
}

export interface OrderRepository {
  /** Creates an order (async payment). `idempotencyKey` protects retries. */
  create(reservationId: string, idempotencyKey: string): Promise<Outcome<Order>>;
  get(id: string): Promise<Outcome<Order>>;
}

/** Produces client-side idempotency keys. A port so tests inject a deterministic sequence. */
export interface IdempotencyKeyFactory {
  newKey(): string;
}

/** Authenticates and rotates tokens. Login proves identity with credentials; refresh proves
 * it with the refresh token itself. */
export interface AuthRepository {
  login(email: string, password: string): Promise<Outcome<TokenPair>>;
  /** Exchanges the refresh token for a new, rotated pair. A failure means the session is over. */
  refresh(refreshToken: string): Promise<Outcome<TokenPair>>;
}

/** Persists the token pair: access token in memory, refresh token in the platform secure
 * store. InMemoryTokenStore is the test/demo implementation. */
export interface TokenStore {
  current(): TokenPair | null;
  save(tokens: TokenPair): void;
  clear(): void;
}
