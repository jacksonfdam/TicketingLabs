// Unit tests for the reservation use case. No Postgres, no Redis, no Express. They
// mirror the Go, FastAPI, and NestJS tests, because the same invariants must hold.

import { describe, expect, it } from 'vitest';

import { AllowAllRateLimiter, MemLocker, MemReservations, MemSectors, Store } from '../src/adapter/memory';
import { Errors } from '../src/domain/errors';
import { Sector } from '../src/domain/models';
import { ReservationService } from '../src/usecase/services';

class FixedClock {
  constructor(public t: Date) {}
  now() {
    return this.t;
  }
}
class SeqIds {
  n = 0;
  newId() {
    return `id-${++this.n}`;
  }
}
const AlwaysAdmit = { isAdmitted: async () => true };
const NeverAdmit = { isAdmitted: async () => false };

function fixture(available: number, admission = AlwaysAdmit) {
  const store = new Store();
  store.putSector({
    id: 'sec',
    eventId: 'evt',
    name: 'Pista',
    priceCents: 100,
    currency: 'BRL',
    totalInventory: available,
    availableInventory: available,
  } as Sector);
  const svc = new ReservationService(
    new MemReservations(store),
    new MemSectors(store),
    new MemLocker(),
    admission,
    new FixedClock(new Date('2026-01-01T00:00:00Z')),
    new SeqIds(),
    60_000,
  );
  return { store, svc };
}

describe('reservation invariants', () => {
  it('never oversells under concurrency', async () => {
    const available = 100;
    const buyers = 500;
    const { store, svc } = fixture(available);
    const results = await Promise.all(
      Array.from({ length: buyers }, (_, i) =>
        svc
          .create(`user-${i}`, 'sec', 1, `key-${i}`)
          .then(() => 'ok')
          .catch((e) => e.code),
      ),
    );
    expect(results.filter((r) => r === 'ok').length).toBe(available);
    expect(results.filter((r) => r === Errors.InventoryExhausted.code).length).toBe(buyers - available);
    expect(store.sectors.get('sec')!.availableInventory).toBe(0);
  });

  it('is idempotent under concurrent replays of the same key', async () => {
    const { store, svc } = fixture(50);
    const ids = await Promise.all(
      Array.from({ length: 40 }, () => svc.create('same-user', 'sec', 2, 'same-key').then((r) => r.reservation.id)),
    );
    expect(new Set(ids).size).toBe(1);
    expect(store.sectors.get('sec')!.availableInventory).toBe(48);
  });

  it('requires an admitted queue token', async () => {
    const { svc } = fixture(10, NeverAdmit);
    await expect(svc.create('user', 'sec', 1, 'k')).rejects.toMatchObject({ code: Errors.NotAdmitted.code });
  });

  it('returns stock on release and is idempotent', async () => {
    const { store, svc } = fixture(10);
    const res = await svc.create('user', 'sec', 3, 'k');
    await svc.release('user', res.reservation.id);
    await svc.release('user', res.reservation.id);
    expect(store.sectors.get('sec')!.availableInventory).toBe(10);
  });

  it('sweeps expired holds and returns their stock', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const { store, svc } = fixture(10);
    (svc as unknown as { clock: FixedClock }).clock = clock;
    await svc.create('user', 'sec', 4, 'k');
    clock.t = new Date('2026-01-01T00:05:00Z');
    expect(await svc.sweepExpired(100)).toBe(1);
    expect(store.sectors.get('sec')!.availableInventory).toBe(10);
  });
});
