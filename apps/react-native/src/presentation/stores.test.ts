import { appError, fail, ok, Outcome } from '../core/core';
import { Order, Reservation } from '../domain/models';
import { IdempotencyKeyFactory, OrderRepository, ReservationRepository } from '../domain/repositories';
import { createOrderUseCase, createReservationUseCase } from '../domain/usecases';
import { createOrderStore, createReservationStore } from './stores';

const order = (status: Order['status']): Order => ({
  id: 'o1', reservationId: 'r1', userId: 'u1', amountCents: 1000, status, createdAt: new Date('2026-01-01'),
});

class FixedKeys implements IdempotencyKeyFactory {
  private n = 0;
  newKey() {
    const k = `key-${this.n}`;
    this.n += 1;
    return k;
  }
}

class SlowReservationRepo implements ReservationRepository {
  keysSeen: string[] = [];
  async create(_s: string, _q: number, key: string): Promise<Outcome<Reservation>> {
    await new Promise((r) => setTimeout(r, 20));
    this.keysSeen.push(key);
    return ok({ id: 'r1', userId: 'u1', sectorId: 's1', quantity: 2, status: 'held', expiresAt: new Date('2026-01-01') });
  }
  async release() {
    return ok<void>(undefined);
  }
}

class ScriptedOrders implements OrderRepository {
  createKeys: string[] = [];
  constructor(private creates: Outcome<Order>[], private gets: Outcome<Order>[]) {}
  async create(_r: string, key: string) {
    this.createKeys.push(key);
    return this.creates.length > 1 ? this.creates.shift()! : this.creates[0];
  }
  async get() {
    return this.gets.length > 1 ? this.gets.shift()! : this.gets[0];
  }
}

it('ReservationStore: a double tap fires one request with one key', async () => {
  const repo = new SlowReservationRepo();
  const store = createReservationStore(createReservationUseCase(repo), new FixedKeys());
  const first = store.getState().reserve('s1', 2);
  const second = store.getState().reserve('s1', 2); // ignored: first in flight
  await Promise.all([first, second]);
  expect(repo.keysSeen).toEqual(['key-0']);
  expect(store.getState().state.kind).toBe('success');
});

it('OrderStore: unknown outcome on create is reconciled with the same key, then settles', async () => {
  const repo = new ScriptedOrders(
    [fail(appError('PaymentUnknown')), fail(appError('PaymentUnknown')), ok(order('pending'))],
    [ok(order('paid'))],
  );
  const store = createOrderStore(createOrderUseCase(repo), repo, new FixedKeys(), 1);
  await store.getState().checkout('r1');
  expect(store.getState().state.kind).toBe('success');
  expect(store.getState().state.kind === 'success' && store.getState().state).toBeTruthy();
  expect(repo.createKeys).toEqual(['key-0', 'key-0', 'key-0']);
});

it('OrderStore: a real failure on create surfaces as an error', async () => {
  const repo = new ScriptedOrders([fail(appError('Conflict', { backendCode: 'reservation_expired' }))], [ok(order('pending'))]);
  const store = createOrderStore(createOrderUseCase(repo), repo, new FixedKeys(), 1);
  await store.getState().checkout('r1');
  expect(store.getState().state.kind).toBe('error');
});
