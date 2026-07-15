// Ports: the interfaces the use cases depend on. Adapters implement them and are
// injected. The TOKENS are NestJS DI identifiers used to bind concrete adapters to
// these interfaces in the module; the use-case classes themselves never import Nest.

import {
  Event,
  Order,
  Payment,
  QueueToken,
  Reservation,
  Role,
  Sector,
  User,
} from '../domain/models';

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}

export interface EventRepository {
  list(cursor: string, limit: number): Promise<{ events: Event[]; nextCursor: string }>;
  findById(id: string): Promise<Event | null>;
}

export interface SectorRepository {
  listByEvent(eventId: string): Promise<Sector[]>;
  findById(id: string): Promise<Sector | null>;
  // Returns true only if enough remained. The conditional UPDATE is the real
  // guarantee against overselling; the distributed lock is belt and braces.
  decrementInventory(sectorId: string, qty: number): Promise<boolean>;
  incrementInventory(sectorId: string, qty: number): Promise<void>;
}

export interface QueueRepository {
  upsert(token: QueueToken): Promise<void>;
  find(userId: string, eventId: string): Promise<QueueToken | null>;
  nextPosition(eventId: string): Promise<number>;
}

export interface ReservationRepository {
  // create throws Errors.Conflict on a unique (user_id, idempotency_key) violation.
  create(r: Reservation): Promise<void>;
  findById(id: string): Promise<Reservation | null>;
  findByIdempotencyKey(userId: string, key: string): Promise<Reservation | null>;
  updateStatus(id: string, status: string): Promise<void>;
  findExpired(now: Date, limit: number): Promise<Reservation[]>;
}

export interface OrderRepository {
  create(o: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  findByReservationId(reservationId: string): Promise<Order | null>;
  findByIdempotencyKey(userId: string, key: string): Promise<Order | null>;
  updateStatus(id: string, status: string): Promise<void>;
}

export interface PaymentRepository {
  // Idempotent by provider_ref so a replayed webhook is a no-op.
  upsert(p: Payment): Promise<void>;
  findByOrderId(orderId: string): Promise<Payment | null>;
}

export interface LockHandle {
  release(): Promise<void>;
}

export interface Locker {
  acquire(key: string, waitMs: number): Promise<LockHandle | null>;
}

export interface Publisher {
  publish(topic: string, payload: Buffer): Promise<void>;
}

export interface RateLimiter {
  allow(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  newId(): string;
}

export interface PasswordHasher {
  verify(hash: string, plaintext: string): boolean;
}

export interface TokenService {
  issueAccess(userId: string, role: Role): { token: string; expiresIn: number };
  issueRefresh(userId: string): Promise<string>;
  rotate(refreshToken: string): Promise<string>; // returns userId; throws on reuse
  parseAccess(token: string): { userId: string; role: Role };
}

export interface PaymentGateway {
  charge(orderId: string): Promise<string>; // returns providerRef
}

// DI tokens. Interfaces vanish at compile time, so NestJS binds by these symbols.
export const TOKENS = {
  UserRepository: Symbol('UserRepository'),
  EventRepository: Symbol('EventRepository'),
  SectorRepository: Symbol('SectorRepository'),
  QueueRepository: Symbol('QueueRepository'),
  ReservationRepository: Symbol('ReservationRepository'),
  OrderRepository: Symbol('OrderRepository'),
  PaymentRepository: Symbol('PaymentRepository'),
  Locker: Symbol('Locker'),
  Publisher: Symbol('Publisher'),
  RateLimiter: Symbol('RateLimiter'),
  Clock: Symbol('Clock'),
  IdGenerator: Symbol('IdGenerator'),
  PasswordHasher: Symbol('PasswordHasher'),
  TokenService: Symbol('TokenService'),
  PaymentGateway: Symbol('PaymentGateway'),
  AuthService: Symbol('AuthService'),
  EventService: Symbol('EventService'),
  QueueService: Symbol('QueueService'),
  ReservationService: Symbol('ReservationService'),
  OrderService: Symbol('OrderService'),
  PaymentService: Symbol('PaymentService'),
  Config: Symbol('Config'),
} as const;
