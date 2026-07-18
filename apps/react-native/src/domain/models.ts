// Validated domain models. Built via factory functions that reject impossible data, so a
// half-valid object never propagates.

export type EventStatus = 'draft' | 'onSale' | 'soldOut' | 'closed';
export type QueueStatus = 'waiting' | 'admitted' | 'expired';
export type ReservationStatus = 'held' | 'confirmed' | 'released' | 'expired';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface Money {
  readonly amountCents: number;
  readonly currency: string;
}

export function money(amountCents: number, currency: string): Money {
  if (amountCents < 0) throw new RangeError('amountCents must be >= 0');
  if (currency.length !== 3) throw new RangeError('currency must be 3 letters');
  return { amountCents, currency };
}

export interface Event {
  readonly id: string;
  readonly name: string;
  readonly venue: string;
  readonly startsAt: Date;
  readonly salesOpenAt: Date;
  readonly status: EventStatus;
}

export interface Sector {
  readonly id: string;
  readonly eventId: string;
  readonly name: string;
  readonly price: Money;
  readonly totalInventory: number;
  readonly availableInventory: number;
}

export function sector(s: Sector): Sector {
  if (s.totalInventory < 0) throw new RangeError('totalInventory must be >= 0');
  if (s.availableInventory < 0 || s.availableInventory > s.totalInventory) {
    throw new RangeError('availableInventory out of range');
  }
  return s;
}

export const isSoldOut = (s: Sector): boolean => s.availableInventory <= 0;

export interface EventDetail {
  readonly event: Event;
  readonly sectors: readonly Sector[];
}

export interface EventPage {
  readonly events: readonly Event[];
  readonly nextCursor: string | null;
}

export interface QueueToken {
  readonly id: string;
  readonly userId: string;
  readonly eventId: string;
  readonly position: number;
  readonly status: QueueStatus;
  readonly admittedAt: Date | null;
}

export const isAdmitted = (t: QueueToken): boolean => t.status === 'admitted';

export interface Reservation {
  readonly id: string;
  readonly userId: string;
  readonly sectorId: string;
  readonly quantity: number;
  readonly status: ReservationStatus;
  readonly expiresAt: Date;
}

export const isHeld = (r: Reservation): boolean => r.status === 'held';

export interface Order {
  readonly id: string;
  readonly reservationId: string;
  readonly userId: string;
  readonly amountCents: number;
  readonly status: OrderStatus;
  readonly createdAt: Date;
}

export const isSettled = (o: Order): boolean => o.status !== 'pending';

/** A pair of tokens from the auth endpoints. Access token on every request; refresh token
 * long-lived, rotated on use, and kept in the platform secure store. */
export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
}
