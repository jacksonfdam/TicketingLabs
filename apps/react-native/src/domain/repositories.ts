// Repository ports: the boundary between business logic and the outside world. Use cases
// depend on these interfaces, never on the HTTP client.

import { Outcome } from '../core/core';
import { EventDetail, EventPage, Order, QueueToken, Reservation } from './models';

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
