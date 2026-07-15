// Postgres adapter over node-postgres (pg). The interesting method is
// SectorsRepo.decrementInventory: a single conditional UPDATE that makes overselling
// impossible at the database, exactly as in the Go and FastAPI backends.

import { Pool } from 'pg';
import { validate as isUuid } from 'uuid';

import { Errors } from '../domain/errors';
import {
  Event,
  EventStatus,
  Order,
  OrderStatus,
  Payment,
  PaymentStatus,
  QueueStatus,
  QueueToken,
  Reservation,
  ReservationStatus,
  Role,
  Sector,
  User,
} from '../domain/models';
import {
  EventRepository,
  OrderRepository,
  PaymentRepository,
  QueueRepository,
  ReservationRepository,
  SectorRepository,
  UserRepository,
} from '../usecase/ports';

const UNIQUE_VIOLATION = '23505';

function isUniqueError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
}

export class UsersRepo implements UserRepository {
  constructor(private pool: Pool) {}
  private row = (r: any): User => ({
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role as Role,
    createdAt: r.created_at,
  });
  async findByEmail(email: string) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ? this.row(rows[0]) : null;
  }
  async findById(id: string) {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? this.row(rows[0]) : null;
  }
}

export class EventsRepo implements EventRepository {
  constructor(private pool: Pool) {}
  private row = (r: any): Event => ({
    id: r.id,
    name: r.name,
    venue: r.venue,
    startsAt: r.starts_at,
    salesOpenAt: r.sales_open_at,
    status: r.status as EventStatus,
  });
  async list(cursor: string, limit: number) {
    const cols = 'id, name, venue, starts_at, sales_open_at, status';
    let rows;
    if (!cursor) {
      ({ rows } = await this.pool.query(`SELECT ${cols} FROM events ORDER BY id LIMIT $1`, [limit + 1]));
    } else {
      // The cursor is the last seen id, so it must be a uuid. A malformed cursor is a
      // client error (400), not a reason to hand Postgres bad input.
      if (!isUuid(cursor)) throw Errors.BadRequest;
      ({ rows } = await this.pool.query(
        `SELECT ${cols} FROM events WHERE id > $1 ORDER BY id LIMIT $2`,
        [cursor, limit + 1],
      ));
    }
    const events = rows.map(this.row);
    let nextCursor = '';
    if (events.length > limit) {
      nextCursor = events[limit - 1].id;
      events.length = limit;
    }
    return { events, nextCursor };
  }
  async findById(id: string) {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query(
      'SELECT id, name, venue, starts_at, sales_open_at, status FROM events WHERE id = $1',
      [id],
    );
    return rows[0] ? this.row(rows[0]) : null;
  }
}

export class SectorsRepo implements SectorRepository {
  constructor(private pool: Pool) {}
  private row = (r: any): Sector => ({
    id: r.id,
    eventId: r.event_id,
    name: r.name,
    priceCents: Number(r.price_cents),
    currency: r.currency,
    totalInventory: r.total_inventory,
    availableInventory: r.available_inventory,
  });
  async listByEvent(eventId: string) {
    if (!isUuid(eventId)) return [];
    const { rows } = await this.pool.query(
      'SELECT id, event_id, name, price_cents, currency, total_inventory, available_inventory FROM sectors WHERE event_id = $1 ORDER BY name',
      [eventId],
    );
    return rows.map(this.row);
  }
  async findById(id: string) {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query(
      'SELECT id, event_id, name, price_cents, currency, total_inventory, available_inventory FROM sectors WHERE id = $1',
      [id],
    );
    return rows[0] ? this.row(rows[0]) : null;
  }
  async decrementInventory(sectorId: string, qty: number) {
    // The anti-overselling primitive. rowCount tells us if the row matched without a
    // separate read; no match means not enough remained.
    const res = await this.pool.query(
      'UPDATE sectors SET available_inventory = available_inventory - $2 WHERE id = $1 AND available_inventory >= $2',
      [sectorId, qty],
    );
    return res.rowCount === 1;
  }
  async incrementInventory(sectorId: string, qty: number) {
    await this.pool.query('UPDATE sectors SET available_inventory = available_inventory + $2 WHERE id = $1', [
      sectorId,
      qty,
    ]);
  }
}

export class QueueRepo implements QueueRepository {
  constructor(private pool: Pool) {}
  async upsert(t: QueueToken) {
    await this.pool.query(
      `INSERT INTO queue_tokens (id, user_id, event_id, position, status, admitted_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, event_id) DO UPDATE SET status = EXCLUDED.status, admitted_at = EXCLUDED.admitted_at`,
      [t.id, t.userId, t.eventId, t.position, t.status, t.admittedAt],
    );
  }
  async find(userId: string, eventId: string) {
    if (!isUuid(userId) || !isUuid(eventId)) return null;
    const { rows } = await this.pool.query(
      'SELECT id, user_id, event_id, position, status, admitted_at FROM queue_tokens WHERE user_id = $1 AND event_id = $2',
      [userId, eventId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      userId: r.user_id,
      eventId: r.event_id,
      position: r.position,
      status: r.status as QueueStatus,
      admittedAt: r.admitted_at,
    };
  }
  async nextPosition(eventId: string) {
    const { rows } = await this.pool.query(
      'SELECT COALESCE(MAX(position)+1, 0) AS pos FROM queue_tokens WHERE event_id = $1',
      [eventId],
    );
    return Number(rows[0].pos);
  }
}

export class ReservationsRepo implements ReservationRepository {
  constructor(private pool: Pool) {}
  private static COLS =
    'id, user_id, sector_id, quantity, status, expires_at, idempotency_key, created_at';
  private row = (r: any): Reservation => ({
    id: r.id,
    userId: r.user_id,
    sectorId: r.sector_id,
    quantity: r.quantity,
    status: r.status as ReservationStatus,
    expiresAt: r.expires_at,
    idempotencyKey: r.idempotency_key,
    createdAt: r.created_at,
  });
  async create(r: Reservation) {
    try {
      await this.pool.query(
        `INSERT INTO reservations (id, user_id, sector_id, quantity, status, expires_at, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [r.id, r.userId, r.sectorId, r.quantity, r.status, r.expiresAt, r.idempotencyKey, r.createdAt],
      );
    } catch (err) {
      if (isUniqueError(err)) throw Errors.Conflict;
      throw err;
    }
  }
  async findById(id: string) {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query(`SELECT ${ReservationsRepo.COLS} FROM reservations WHERE id = $1`, [id]);
    return rows[0] ? this.row(rows[0]) : null;
  }
  async findByIdempotencyKey(userId: string, key: string) {
    const { rows } = await this.pool.query(
      `SELECT ${ReservationsRepo.COLS} FROM reservations WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, key],
    );
    return rows[0] ? this.row(rows[0]) : null;
  }
  async updateStatus(id: string, status: string) {
    await this.pool.query('UPDATE reservations SET status = $2 WHERE id = $1', [id, status]);
  }
  async findExpired(now: Date, limit: number) {
    const { rows } = await this.pool.query(
      `SELECT ${ReservationsRepo.COLS} FROM reservations WHERE status = 'held' AND expires_at < $1 LIMIT $2`,
      [now, limit],
    );
    return rows.map(this.row);
  }
}

export class OrdersRepo implements OrderRepository {
  constructor(private pool: Pool) {}
  private static COLS = 'id, reservation_id, user_id, amount_cents, status, idempotency_key, created_at';
  private row = (r: any): Order => ({
    id: r.id,
    reservationId: r.reservation_id,
    userId: r.user_id,
    amountCents: Number(r.amount_cents),
    status: r.status as OrderStatus,
    idempotencyKey: r.idempotency_key,
    createdAt: r.created_at,
  });
  async create(o: Order) {
    try {
      await this.pool.query(
        `INSERT INTO orders (id, reservation_id, user_id, amount_cents, status, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [o.id, o.reservationId, o.userId, o.amountCents, o.status, o.idempotencyKey],
      );
    } catch (err) {
      if (isUniqueError(err)) throw Errors.Conflict;
      throw err;
    }
  }
  async findById(id: string) {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query(`SELECT ${OrdersRepo.COLS} FROM orders WHERE id = $1`, [id]);
    return rows[0] ? this.row(rows[0]) : null;
  }
  async findByReservationId(reservationId: string) {
    const { rows } = await this.pool.query(`SELECT ${OrdersRepo.COLS} FROM orders WHERE reservation_id = $1`, [
      reservationId,
    ]);
    return rows[0] ? this.row(rows[0]) : null;
  }
  async findByIdempotencyKey(userId: string, key: string) {
    const { rows } = await this.pool.query(
      `SELECT ${OrdersRepo.COLS} FROM orders WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, key],
    );
    return rows[0] ? this.row(rows[0]) : null;
  }
  async updateStatus(id: string, status: string) {
    await this.pool.query('UPDATE orders SET status = $2 WHERE id = $1', [id, status]);
  }
}

export class PaymentsRepo implements PaymentRepository {
  constructor(private pool: Pool) {}
  async upsert(p: Payment) {
    await this.pool.query(
      `INSERT INTO payments (id, order_id, provider_ref, status, attempts)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider_ref) DO UPDATE SET status = EXCLUDED.status, attempts = payments.attempts + 1`,
      [p.id, p.orderId, p.providerRef, p.status, p.attempts],
    );
  }
  async findByOrderId(orderId: string) {
    const { rows } = await this.pool.query(
      'SELECT id, order_id, provider_ref, status, attempts FROM payments WHERE order_id = $1 LIMIT 1',
      [orderId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      orderId: r.order_id,
      providerRef: r.provider_ref,
      status: r.status as PaymentStatus,
      attempts: r.attempts,
    };
  }
}
