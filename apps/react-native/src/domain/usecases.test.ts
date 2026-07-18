import { appError, fail, ok, Outcome } from '../core/core';
import { Order, Reservation } from './models';
import { OrderRepository, ReservationRepository } from './repositories';
import { createOrderUseCase, createReservationUseCase, reconcileOrderPoll } from './usecases';

const sampleReservation: Reservation = {
  id: 'r1', userId: 'u1', sectorId: 's1', quantity: 2, status: 'held', expiresAt: new Date('2026-01-01'),
};
const order = (status: Order['status']): Order => ({
  id: 'o1', reservationId: 'r1', userId: 'u1', amountCents: 1000, status, createdAt: new Date('2026-01-01'),
});

class FakeReservationRepo implements ReservationRepository {
  keysSeen: string[] = [];
  constructor(private answer: () => Outcome<Reservation> = () => ok(sampleReservation)) {}
  async create(_s: string, _q: number, key: string) {
    this.keysSeen.push(key);
    return this.answer();
  }
  async release() {
    return ok<void>(undefined);
  }
}

class FakeOrderRepo implements OrderRepository {
  constructor(private onCreate: () => Outcome<Order>) {}
  async create() {
    return this.onCreate();
  }
  async get() {
    return this.onCreate();
  }
}

describe('createReservationUseCase', () => {
  it('rejects an out-of-range quantity without touching the repo', async () => {
    const repo = new FakeReservationRepo();
    const result = await createReservationUseCase(repo)('s1', 0, 'k');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('Validation');
    expect(repo.keysSeen).toEqual([]);
  });

  it('passes a valid quantity and the key through', async () => {
    const repo = new FakeReservationRepo();
    const result = await createReservationUseCase(repo)('s1', 2, 'idem-1');
    expect(result.ok).toBe(true);
    expect(repo.keysSeen).toEqual(['idem-1']);
  });
});

describe('createOrderUseCase', () => {
  it('maps a create timeout to PaymentUnknown, not a failure', async () => {
    const uc = createOrderUseCase(new FakeOrderRepo(() => fail(appError('Timeout'))));
    const result = await uc('r1', 'k');
    expect(!result.ok && result.error.code).toBe('PaymentUnknown');
  });

  it('maps a network drop to PaymentUnknown', async () => {
    const uc = createOrderUseCase(new FakeOrderRepo(() => fail(appError('NetworkUnavailable'))));
    const result = await uc('r1', 'k');
    expect(!result.ok && result.error.code).toBe('PaymentUnknown');
  });

  it('passes a real conflict through unchanged', async () => {
    const uc = createOrderUseCase(new FakeOrderRepo(() => fail(appError('Conflict', { backendCode: 'reservation_expired' }))));
    const result = await uc('r1', 'k');
    expect(!result.ok && result.error.code).toBe('Conflict');
  });
});

describe('reconcileOrderPoll', () => {
  it('a paid order resolves', () => {
    expect(reconcileOrderPoll(ok(order('paid'))).kind).toBe('resolved');
  });
  it('a pending order continues', () => {
    expect(reconcileOrderPoll(ok(order('pending'))).kind).toBe('continue');
  });
  it('a transient failure continues', () => {
    expect(reconcileOrderPoll(fail(appError('Timeout'))).kind).toBe('continue');
    expect(reconcileOrderPoll(fail(appError('PaymentUnknown'))).kind).toBe('continue');
  });
  it('a non-transient failure aborts', () => {
    expect(reconcileOrderPoll(fail(appError('Unauthorized'))).kind).toBe('abort');
  });
});
