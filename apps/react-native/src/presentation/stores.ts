// State holders as vanilla zustand stores: framework-free, so they are driven from tests
// without React and wrapped by hooks in the UI. The order store owns the payment
// reconcile-and-poll loop.

import { createStore, StoreApi } from 'zustand/vanilla';

import { errorToUiState, UiState } from '../core/core';
import { Event, isAdmitted, Order, QueueToken, Reservation } from '../domain/models';
import { EventRepository, IdempotencyKeyFactory, OrderRepository, QueueRepository } from '../domain/repositories';
import { createOrderUseCase, createReservationUseCase, reconcileOrderPoll } from '../domain/usecases';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface EventsStore {
  state: UiState<Event[]>;
  load: (isRetry?: boolean) => Promise<void>;
}

/** Events list. Empty → empty state; failure → typed error; reload after failure → retrying. */
export function createEventsStore(repo: EventRepository): StoreApi<EventsStore> {
  let inFlight = false;
  return createStore<EventsStore>((set) => ({
    state: { kind: 'idle' },
    load: async (isRetry = false) => {
      if (inFlight) return;
      inFlight = true;
      set({ state: { kind: isRetry ? 'retrying' : 'loading' } });
      const result = await repo.listEvents();
      set({
        state: result.ok
          ? result.value.events.length === 0
            ? { kind: 'empty' }
            : { kind: 'success', data: [...result.value.events] }
          : errorToUiState(result.error),
      });
      inFlight = false;
    },
  }));
}

export interface ReservationStore {
  state: UiState<Reservation>;
  reserve: (sectorId: string, quantity: number) => Promise<void>;
  reset: () => void;
}

/** Reservation, with the double-tap defences: an in-flight guard and one stable key reused
 * across retries of the intent. */
export function createReservationStore(
  create: ReturnType<typeof createReservationUseCase>,
  keys: IdempotencyKeyFactory,
): StoreApi<ReservationStore> {
  let inFlight = false;
  let intentKey: string | null = null;
  return createStore<ReservationStore>((set) => ({
    state: { kind: 'idle' },
    reserve: async (sectorId, quantity) => {
      if (inFlight) return;
      inFlight = true;
      intentKey ??= keys.newKey();
      set({ state: { kind: 'loading' } });
      const result = await create(sectorId, quantity, intentKey);
      set({ state: result.ok ? { kind: 'success', data: result.value } : errorToUiState(result.error) });
      inFlight = false;
    },
    reset: () => {
      intentKey = null;
      set({ state: { kind: 'idle' } });
    },
  }));
}

export interface WaitingRoomStore {
  state: UiState<QueueToken>;
  start: (eventId: string) => Promise<void>;
  stop: () => void;
}

/** Waiting room: join, then poll until admitted. Rate-limits back off; transient failures
 * keep polling; only a non-transient error stops the loop. */
export function createWaitingRoomStore(repo: QueueRepository, intervalMs = 1500): StoreApi<WaitingRoomStore> {
  let running = false;
  return createStore<WaitingRoomStore>((set, get) => ({
    state: { kind: 'idle' },
    start: async (eventId) => {
      if (running) return;
      running = true;
      set({ state: { kind: 'loading' } });
      const joined = await repo.join(eventId);
      if (!joined.ok) {
        set({ state: errorToUiState(joined.error) });
        running = false;
        return;
      }
      set({ state: { kind: 'success', data: joined.value } });
      while (running) {
        const current = get().state;
        if (current.kind === 'success' && isAdmitted(current.data)) break;
        await sleep(intervalMs);
        if (!running) break;
        const result = await repo.status(eventId);
        if (result.ok) {
          set({ state: { kind: 'success', data: result.value } });
        } else if (result.error.code === 'RateLimited') {
          await sleep((result.error.retryAfterSeconds ?? 1) * 1000);
        } else if (result.error.code === 'Timeout' || result.error.code === 'NetworkUnavailable') {
          // transient; keep polling
        } else {
          set({ state: errorToUiState(result.error) });
          running = false;
        }
      }
      running = false;
    },
    stop: () => {
      running = false;
    },
  }));
}

export interface OrderStore {
  state: UiState<Order>;
  checkout: (reservationId: string) => Promise<void>;
  stop: () => void;
}

/** Checkout and settlement. Creates the order, reconciling an unknown outcome by retrying
 * with the same key, then polls until settled. Never reports a false failure. */
export function createOrderStore(
  create: ReturnType<typeof createOrderUseCase>,
  orders: OrderRepository,
  keys: IdempotencyKeyFactory,
  intervalMs = 1000,
  maxUnknownRetries = 5,
): StoreApi<OrderStore> {
  let running = false;
  let intentKey: string | null = null;

  return createStore<OrderStore>((set) => {
    async function createReconciling(reservationId: string, key: string): Promise<Order | null> {
      let attempts = 0;
      while (running) {
        const result = await create(reservationId, key);
        if (result.ok) return result.value;
        if (result.error.code === 'PaymentUnknown') {
          set({ state: { kind: 'error', error: result.error } }); // "confirming", recovery = wait
          if (++attempts >= maxUnknownRetries) return null;
          await sleep(intervalMs);
        } else {
          set({ state: errorToUiState(result.error) });
          return null;
        }
      }
      return null;
    }

    async function pollUntilSettled(id: string): Promise<void> {
      while (running) {
        const decision = reconcileOrderPoll(await orders.get(id));
        if (decision.kind === 'resolved') {
          set({ state: { kind: 'success', data: decision.order } });
          return;
        }
        if (decision.kind === 'abort') {
          set({ state: errorToUiState(decision.error) });
          return;
        }
        await sleep(intervalMs);
      }
    }

    return {
      state: { kind: 'idle' },
      checkout: async (reservationId) => {
        if (running) return;
        running = true;
        intentKey ??= keys.newKey();
        set({ state: { kind: 'loading' } });
        const order = await createReconciling(reservationId, intentKey);
        if (!order) {
          running = false;
          return;
        }
        set({ state: { kind: 'success', data: order } });
        await pollUntilSettled(order.id);
        running = false;
      },
      stop: () => {
        running = false;
      },
    };
  });
}
