// Domain entities and enums. Imports nothing from Express or any driver. The same
// model the Go, FastAPI, and NestJS backends implement; only the language changes.

export enum Role {
  Customer = 'customer',
  Admin = 'admin',
}

export enum EventStatus {
  Draft = 'draft',
  OnSale = 'on_sale',
  SoldOut = 'sold_out',
  Closed = 'closed',
}

export enum QueueStatus {
  Waiting = 'waiting',
  Admitted = 'admitted',
  Expired = 'expired',
}

export enum ReservationStatus {
  Held = 'held',
  Confirmed = 'confirmed',
  Released = 'released',
  Expired = 'expired',
}

export enum OrderStatus {
  Pending = 'pending',
  Paid = 'paid',
  Failed = 'failed',
  Refunded = 'refunded',
}

export enum PaymentStatus {
  Pending = 'pending',
  Succeeded = 'succeeded',
  Failed = 'failed',
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
}

export interface Event {
  id: string;
  name: string;
  venue: string;
  startsAt: Date;
  salesOpenAt: Date;
  status: EventStatus;
}

export interface Sector {
  id: string;
  eventId: string;
  name: string;
  priceCents: number;
  currency: string;
  totalInventory: number;
  availableInventory: number;
}

export interface QueueToken {
  id: string;
  userId: string;
  eventId: string;
  position: number;
  status: QueueStatus;
  admittedAt: Date | null;
}

export interface Reservation {
  id: string;
  userId: string;
  sectorId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
  idempotencyKey: string;
  createdAt: Date | null;
}

export interface Order {
  id: string;
  reservationId: string;
  userId: string;
  amountCents: number;
  status: OrderStatus;
  idempotencyKey: string | null;
  createdAt: Date | null;
}

export interface Payment {
  id: string;
  orderId: string;
  providerRef: string;
  status: PaymentStatus;
  attempts: number;
}
