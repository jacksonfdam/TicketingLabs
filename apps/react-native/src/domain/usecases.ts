// Framework-free use cases: the business logic, unit-testable without React.

import { AppError, appError, fail, Outcome } from '../core/core';
import { isSettled, Order, Reservation } from './models';
import { OrderRepository, ReservationRepository } from './repositories';

export const RESERVATION_QUANTITY_RANGE = { min: 1, max: 8 } as const;

/**
 * Creates a hold with input hardening and idempotency. The quantity is validated before
 * anything is sent; the `idempotencyKey` is caller-owned and stable across retries of the
 * intent, so a double tap makes one reservation.
 */
export function createReservationUseCase(reservations: ReservationRepository) {
  return async (sectorId: string, quantity: number, idempotencyKey: string): Promise<Outcome<Reservation>> => {
    if (quantity < RESERVATION_QUANTITY_RANGE.min || quantity > RESERVATION_QUANTITY_RANGE.max) {
      return fail(appError('Validation', { cause: `quantity ${quantity} out of range` }));
    }
    return reservations.create(sectorId, quantity, idempotencyKey);
  };
}

/**
 * Creates an order, mapping an unresolved create (timeout or network drop) to
 * PaymentUnknown rather than a false failure. Reporting failure here is how you
 * double-charge someone.
 */
export function createOrderUseCase(orders: OrderRepository) {
  return async (reservationId: string, idempotencyKey: string): Promise<Outcome<Order>> => {
    const result = await orders.create(reservationId, idempotencyKey);
    if (!result.ok && (result.error.code === 'Timeout' || result.error.code === 'NetworkUnavailable')) {
      return fail(
        appError('PaymentUnknown', {
          requestId: result.error.requestId,
          cause: `order create unresolved (${result.error.code}); reconcile by retrying with the same key or polling`,
        }),
      );
    }
    return result;
  };
}

/** The decision for one order-status poll. */
export type Reconciliation =
  | { kind: 'resolved'; order: Order }
  | { kind: 'continue' }
  | { kind: 'abort'; error: AppError };

/**
 * Turns one order-status poll into a decision, with no timers. A settled order resolves; a
 * still-pending order or a transient failure continues; a non-transient error aborts. Pure,
 * so the "when do we stop polling" logic is exhaustively testable.
 */
export function reconcileOrderPoll(pollResult: Outcome<Order>): Reconciliation {
  if (pollResult.ok) {
    return isSettled(pollResult.value) ? { kind: 'resolved', order: pollResult.value } : { kind: 'continue' };
  }
  const code = pollResult.error.code;
  if (code === 'PaymentUnknown' || code === 'Timeout' || code === 'NetworkUnavailable' || code === 'RateLimited') {
    return { kind: 'continue' };
  }
  return { kind: 'abort', error: pollResult.error };
}
