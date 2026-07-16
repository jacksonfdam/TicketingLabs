// All use cases in one module for this compact backend. Plain classes, no framework.
// The reservation flow is the star: idempotency guard, distributed lock, atomic
// conditional decrement, TTL hold. It mirrors the Go, FastAPI, and NestJS backends.

import { DomainError, Errors } from '../domain/errors';
import {
  Order,
  OrderStatus,
  PaymentStatus,
  QueueStatus,
  QueueToken,
  Reservation,
  ReservationStatus,
  Role,
} from '../domain/models';
import {
  Clock,
  EventRepository,
  IdGenerator,
  Locker,
  OrderRepository,
  PasswordHasher,
  PaymentGateway,
  PaymentRepository,
  Publisher,
  QueueRepository,
  RateLimiter,
  ReservationRepository,
  SectorRepository,
  TokenService,
  UserRepository,
} from './ports';

export const TOPIC_PAYMENT_REQUESTED = 'payment.requested';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.users.findByEmail(email);
    // Same error whether the email is unknown or the password is wrong.
    if (!user || !this.hasher.verify(user.passwordHash, password)) throw Errors.InvalidCredentials;
    return this.issue(user.id, user.role);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const userId = await this.tokens.rotate(refreshToken); // throws on reuse/expiry
    const user = await this.users.findById(userId);
    if (!user) throw Errors.InvalidToken;
    return this.issue(user.id, user.role);
  }

  private async issue(userId: string, role: Role): Promise<TokenPair> {
    const { token, expiresIn } = this.tokens.issueAccess(userId, role);
    const refreshToken = await this.tokens.issueRefresh(userId);
    return { accessToken: token, refreshToken, expiresIn };
  }
}

export interface EventDetail {
  event: import('../domain/models').Event;
  sectors: import('../domain/models').Sector[];
}

export class EventService {
  constructor(
    private readonly events: EventRepository,
    private readonly sectors: SectorRepository,
  ) {}

  async list(cursor: string, limit: number) {
    if (limit <= 0 || limit > 100) limit = 20;
    return this.events.list(cursor, limit);
  }

  async get(id: string): Promise<EventDetail> {
    const event = await this.events.findById(id);
    if (!event) throw Errors.NotFound;
    const sectors = await this.sectors.listByEvent(id);
    return { event, sectors };
  }
}

export class QueueService {
  private readonly admitBatch: number;
  constructor(
    private readonly queue: QueueRepository,
    private readonly events: EventRepository,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    admitBatch: number,
  ) {
    this.admitBatch = admitBatch > 0 ? admitBatch : 50;
  }

  async join(userId: string, eventId: string): Promise<QueueToken> {
    if (!(await this.events.findById(eventId))) throw Errors.NotFound;
    if (!(await this.limiter.allow(`queue_join:${userId}:${eventId}`, 5, 60))) throw Errors.RateLimited;

    const existing = await this.queue.find(userId, eventId);
    if (existing) return this.decorate(existing);

    const position = await this.queue.nextPosition(eventId);
    const token: QueueToken = { id: this.ids.newId(), userId, eventId, position, status: QueueStatus.Waiting, admittedAt: null };
    await this.queue.upsert(token);
    return this.decorate(token);
  }

  async status(userId: string, eventId: string): Promise<QueueToken> {
    const token = await this.queue.find(userId, eventId);
    if (!token) throw Errors.NotFound;
    return this.decorate(token);
  }

  async isAdmitted(userId: string, eventId: string): Promise<boolean> {
    const token = await this.queue.find(userId, eventId);
    if (!token) return false;
    return (await this.decorate(token)).status === QueueStatus.Admitted;
  }

  private async decorate(token: QueueToken): Promise<QueueToken> {
    if (token.status === QueueStatus.Waiting && token.position < this.admitBatch) {
      token.status = QueueStatus.Admitted;
      token.admittedAt = this.clock.now();
      await this.queue.upsert(token);
    }
    return token;
  }
}

export interface CreateReservationResult {
  reservation: Reservation;
  replayed: boolean;
}

export interface AdmissionChecker {
  isAdmitted(userId: string, eventId: string): Promise<boolean>;
}

export class ReservationService {
  private readonly lockWaitMs = 3000;
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly sectors: SectorRepository,
    private readonly locker: Locker,
    private readonly admission: AdmissionChecker,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private ttlMs: number,
  ) {
    if (this.ttlMs <= 0) this.ttlMs = 120_000;
  }

  async create(userId: string, sectorId: string, qty: number, idemKey: string): Promise<CreateReservationResult> {
    if (qty < 1 || qty > 8 || !idemKey) throw Errors.Validation;

    // (1) Idempotency fast path.
    const prior = await this.reservations.findByIdempotencyKey(userId, idemKey);
    if (prior) return { reservation: prior, replayed: true };

    const sector = await this.sectors.findById(sectorId);
    if (!sector) throw Errors.NotFound;

    // (2) Checkout gate.
    if (!(await this.admission.isAdmitted(userId, sector.eventId))) throw Errors.NotAdmitted;

    // (3) Distributed lock: contention management, not the correctness guarantee.
    const handle = await this.locker.acquire(`sector:${sectorId}`, this.lockWaitMs);
    if (!handle) throw Errors.LockUnavailable;
    try {
      const raced = await this.reservations.findByIdempotencyKey(userId, idemKey);
      if (raced) return { reservation: raced, replayed: true };

      // (4) Atomic conditional decrement: the real anti-overselling guarantee.
      if (!(await this.sectors.decrementInventory(sectorId, qty))) throw Errors.InventoryExhausted;

      // (5) TTL hold.
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
        await this.sectors.incrementInventory(sectorId, qty); // give the stock back
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
    if (!res || res.userId !== userId) throw Errors.NotFound;
    if (res.status !== ReservationStatus.Held) return; // idempotent no-op, still 204
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

export class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly reservations: ReservationRepository,
    private readonly sectors: SectorRepository,
    private readonly publisher: Publisher,
    private readonly ids: IdGenerator,
  ) {}

  async create(userId: string, reservationId: string, idemKey: string): Promise<Order> {
    if (!idemKey) throw Errors.Validation;

    const prior = await this.orders.findByIdempotencyKey(userId, idemKey);
    if (prior) return prior;

    const res = await this.reservations.findById(reservationId);
    if (!res || res.userId !== userId) throw Errors.NotFound;
    if (res.status !== ReservationStatus.Held) throw Errors.ReservationState;

    const existing = await this.orders.findByReservationId(reservationId);
    if (existing) return existing;

    const sector = await this.sectors.findById(res.sectorId);
    if (!sector) throw Errors.Internal;

    const order: Order = {
      id: this.ids.newId(),
      reservationId,
      userId,
      amountCents: sector.priceCents * res.quantity,
      status: OrderStatus.Pending,
      idempotencyKey: idemKey,
      createdAt: null,
    };
    try {
      await this.orders.create(order);
    } catch (err) {
      if (err instanceof DomainError) {
        const winner = await this.orders.findByIdempotencyKey(userId, idemKey);
        if (winner) return winner;
      }
      throw Errors.Internal;
    }

    try {
      await this.publisher.publish(TOPIC_PAYMENT_REQUESTED, Buffer.from(JSON.stringify({ order_id: order.id })));
    } catch {
      // order is pending; a failed publish is recoverable by reconciliation
    }
    return order;
  }

  async get(id: string): Promise<Order> {
    const order = await this.orders.findById(id);
    if (!order) throw Errors.NotFound;
    return order;
  }
}

export class PaymentService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly reservations: ReservationRepository,
    private readonly payments: PaymentRepository,
    private readonly gateway: PaymentGateway,
    private readonly ids: IdGenerator,
  ) {}

  async processPaymentRequest(orderId: string): Promise<void> {
    const order = await this.orders.findById(orderId);
    if (!order) throw Errors.NotFound;
    if (order.status !== OrderStatus.Pending) return;
    const providerRef = await this.gateway.charge(orderId);
    await this.payments.upsert({ id: this.ids.newId(), orderId, providerRef, status: PaymentStatus.Pending, attempts: 1 });
  }

  async handleWebhook(providerRef: string, orderId: string, succeeded: boolean): Promise<void> {
    const order = await this.orders.findById(orderId);
    if (!order) throw Errors.NotFound;

    await this.payments.upsert({
      id: this.ids.newId(),
      orderId,
      providerRef,
      status: succeeded ? PaymentStatus.Succeeded : PaymentStatus.Failed,
      attempts: 0,
    });

    if (order.status !== OrderStatus.Pending) return;

    if (succeeded) {
      await this.orders.updateStatus(orderId, OrderStatus.Paid);
      await this.reservations.updateStatus(order.reservationId, ReservationStatus.Confirmed);
    } else {
      await this.orders.updateStatus(orderId, OrderStatus.Failed);
    }
  }
}
