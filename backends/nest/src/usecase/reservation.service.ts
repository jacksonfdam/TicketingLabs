import { DomainError, Errors } from '../domain/errors';
import { Reservation, ReservationStatus } from '../domain/models';
import {
  Clock,
  IdGenerator,
  Locker,
  ReservationRepository,
  SectorRepository,
} from './ports';

export interface AdmissionChecker {
  isAdmitted(userId: string, eventId: string): Promise<boolean>;
}

export interface CreateResult {
  reservation: Reservation;
  replayed: boolean;
}

// The most concept-dense code in the backend. One method combines an idempotency
// guard, a distributed lock, an atomic conditional stock decrement, and a TTL hold.
// Read create() slowly; it mirrors the Go and FastAPI backends line for line, which is
// what makes the three comparable.
export class ReservationService {
  private readonly lockWaitMs = 3000;

  constructor(
    private readonly reservations: ReservationRepository,
    private readonly sectors: SectorRepository,
    private readonly locker: Locker,
    private readonly admission: AdmissionChecker,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly ttlMs: number,
  ) {
    if (this.ttlMs <= 0) this.ttlMs = 120_000;
  }

  async create(userId: string, sectorId: string, qty: number, idemKey: string): Promise<CreateResult> {
    if (qty < 1 || qty > 8 || !idemKey) throw Errors.Validation;

    // (1) Idempotency fast path: same key, return the original hold, no work done.
    const prior = await this.reservations.findByIdempotencyKey(userId, idemKey);
    if (prior) return { reservation: prior, replayed: true };

    const sector = await this.sectors.findById(sectorId);
    if (!sector) throw Errors.NotFound;

    // (2) Checkout gate: no admitted queue token for this event, no entry.
    if (!(await this.admission.isAdmitted(userId, sector.eventId))) throw Errors.NotAdmitted;

    // (3) Distributed lock on the sector. Serialises writers so concurrent buyers stop
    // racing and closes the check-then-insert idempotency window. It is contention
    // management, NOT the correctness guarantee.
    const handle = await this.locker.acquire(`sector:${sectorId}`, this.lockWaitMs);
    if (!handle) throw Errors.LockUnavailable;
    try {
      const raced = await this.reservations.findByIdempotencyKey(userId, idemKey);
      if (raced) return { reservation: raced, replayed: true };

      // (4) Atomic conditional decrement. False means not enough left. This one
      // statement is what actually makes overselling impossible.
      if (!(await this.sectors.decrementInventory(sectorId, qty))) throw Errors.InventoryExhausted;

      // (5) Create the hold with a TTL. Unpaid holds are swept back later.
      const now = this.clock.now();
      const res: Reservation = {
        id: this.ids.newId(),
        userId,
        sectorId,
        quantity: qty,
        status: ReservationStatus.Held,
        expiresAt: new Date(now.getTime() + this.ttlMs),
        idempotencyKey: idemKey,
        createdAt: now,
      };
      try {
        await this.reservations.create(res);
      } catch (err) {
        // Lost the unique (user_id, idempotency_key) race: give the stock back and
        // return the winner. Correctness survives the window the lock misses.
        await this.sectors.incrementInventory(sectorId, qty);
        if (err instanceof DomainError && err.code === Errors.Conflict.code) {
          const winner = await this.reservations.findByIdempotencyKey(userId, idemKey);
          if (winner) return { reservation: winner, replayed: true };
        }
        throw Errors.Internal;
      }
      return { reservation: res, replayed: false };
    } finally {
      await handle.release();
    }
  }

  async release(userId: string, reservationId: string): Promise<void> {
    const res = await this.reservations.findById(reservationId);
    if (!res || res.userId !== userId) throw Errors.NotFound; // do not confirm to non-owner
    if (res.status !== ReservationStatus.Held) return; // already resolved: no-op, still 204
    await this.reservations.updateStatus(res.id, ReservationStatus.Released);
    await this.sectors.incrementInventory(res.sectorId, res.quantity);
  }

  async sweepExpired(limit: number): Promise<number> {
    const expired = await this.reservations.findExpired(this.clock.now(), limit);
    let swept = 0;
    for (const r of expired) {
      await this.reservations.updateStatus(r.id, ReservationStatus.Expired);
      await this.sectors.incrementInventory(r.sectorId, r.quantity);
      swept++;
    }
    return swept;
  }

  async get(id: string): Promise<Reservation> {
    const res = await this.reservations.findById(id);
    if (!res) throw Errors.NotFound;
    return res;
  }
}
