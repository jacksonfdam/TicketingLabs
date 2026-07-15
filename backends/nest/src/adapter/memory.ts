// In-process implementations of the ports for unit testing. decrementInventory is
// atomic within the single-threaded event loop (no await mid-operation), and the
// Locker serialises per key, so the reservation tests exercise the real orchestration.

import { Errors } from '../domain/errors';
import {
  Event,
  Order,
  Payment,
  QueueToken,
  Reservation,
  ReservationStatus,
  Sector,
  User,
} from '../domain/models';
import {
  EventRepository,
  LockHandle,
  Locker,
  QueueRepository,
  RateLimiter,
  ReservationRepository,
  SectorRepository,
  UserRepository,
} from '../usecase/ports';

export class Store {
  users = new Map<string, User>();
  usersByEmail = new Map<string, User>();
  events = new Map<string, Event>();
  sectors = new Map<string, Sector>();
  queue = new Map<string, QueueToken>();
  queueSeq = new Map<string, number>();
  reservations = new Map<string, Reservation>();
  resByIdem = new Map<string, string>();
  orders = new Map<string, Order>();
  orderByIdem = new Map<string, string>();
  orderByRes = new Map<string, string>();
  payments = new Map<string, Payment>();

  putUser(u: User) {
    this.users.set(u.id, u);
    this.usersByEmail.set(u.email, u);
  }
  putEvent(e: Event) {
    this.events.set(e.id, e);
  }
  putSector(s: Sector) {
    this.sectors.set(s.id, s);
  }
}

export class MemUsers implements UserRepository {
  constructor(private s: Store) {}
  async findByEmail(email: string) {
    return this.s.usersByEmail.get(email) ?? null;
  }
  async findById(id: string) {
    return this.s.users.get(id) ?? null;
  }
}

export class MemEvents implements EventRepository {
  constructor(private s: Store) {}
  async list(_cursor: string, limit: number) {
    return { events: [...this.s.events.values()].slice(0, limit), nextCursor: '' };
  }
  async findById(id: string) {
    return this.s.events.get(id) ?? null;
  }
}

export class MemSectors implements SectorRepository {
  constructor(private s: Store) {}
  async listByEvent(eventId: string) {
    return [...this.s.sectors.values()].filter((x) => x.eventId === eventId);
  }
  async findById(id: string) {
    return this.s.sectors.get(id) ?? null;
  }
  async decrementInventory(sectorId: string, qty: number) {
    const x = this.s.sectors.get(sectorId);
    if (!x || x.availableInventory < qty) return false;
    x.availableInventory -= qty;
    return true;
  }
  async incrementInventory(sectorId: string, qty: number) {
    const x = this.s.sectors.get(sectorId);
    if (x) x.availableInventory += qty;
  }
}

const qk = (u: string, e: string) => `${u}|${e}`;

export class MemQueue implements QueueRepository {
  constructor(private s: Store) {}
  async upsert(t: QueueToken) {
    this.s.queue.set(qk(t.userId, t.eventId), { ...t });
  }
  async find(userId: string, eventId: string) {
    return this.s.queue.get(qk(userId, eventId)) ?? null;
  }
  async nextPosition(eventId: string) {
    const p = this.s.queueSeq.get(eventId) ?? 0;
    this.s.queueSeq.set(eventId, p + 1);
    return p;
  }
}

const rk = (u: string, k: string) => `${u}|${k}`;

export class MemReservations implements ReservationRepository {
  constructor(private s: Store) {}
  async create(r: Reservation) {
    const key = rk(r.userId, r.idempotencyKey);
    if (this.s.resByIdem.has(key)) throw Errors.Conflict;
    this.s.reservations.set(r.id, { ...r });
    this.s.resByIdem.set(key, r.id);
  }
  async findById(id: string) {
    return this.s.reservations.get(id) ?? null;
  }
  async findByIdempotencyKey(userId: string, key: string) {
    const id = this.s.resByIdem.get(rk(userId, key));
    return id ? (this.s.reservations.get(id) ?? null) : null;
  }
  async updateStatus(id: string, status: string) {
    const r = this.s.reservations.get(id);
    if (r) r.status = status as ReservationStatus;
  }
  async findExpired(now: Date, limit: number) {
    return [...this.s.reservations.values()]
      .filter((r) => r.status === ReservationStatus.Held && now > r.expiresAt)
      .slice(0, limit);
  }
}

export class MemLocker implements Locker {
  private locks = new Map<string, Promise<void>>();
  async acquire(key: string, _waitMs: number): Promise<LockHandle> {
    // Chain promises per key so holders run one at a time within the event loop.
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => (release = resolve));
    this.locks.set(
      key,
      prev.then(() => next),
    );
    await prev;
    return { release: async () => release() };
  }
}

export class AllowAllRateLimiter implements RateLimiter {
  async allow() {
    return true;
  }
}
