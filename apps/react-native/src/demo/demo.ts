// In-memory repositories that behave like a well-behaved backend, so the demo runs the
// whole flow with no server. A demo aid; the real adapters are the Http* repositories.

import { ok, Outcome } from '../core/core';
import { EventDetail, EventPage, money, Order, QueueToken, Reservation } from '../domain/models';
import { EventRepository, IdempotencyKeyFactory, OrderRepository, QueueRepository, ReservationRepository } from '../domain/repositories';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const demoEvents = [
  { id: 'e1', name: 'Skyline Festival', venue: 'Riverside Park', startsAt: new Date('2026-08-01'), salesOpenAt: new Date('2026-07-20'), status: 'onSale' as const },
  { id: 'e2', name: 'Midnight Orchestra', venue: 'Grand Hall', startsAt: new Date('2026-09-01'), salesOpenAt: new Date('2026-07-20'), status: 'onSale' as const },
  { id: 'e3', name: "Last Year's Reunion", venue: 'The Old Venue', startsAt: new Date('2026-06-01'), salesOpenAt: new Date('2026-05-01'), status: 'soldOut' as const },
];

function detail(id: string): EventDetail {
  return {
    event: demoEvents.find((e) => e.id === id) ?? demoEvents[0],
    sectors: [
      { id: 's1', eventId: id, name: 'Front stage', price: money(9500, 'GBP'), totalInventory: 100, availableInventory: 12 },
      { id: 's2', eventId: id, name: 'Stands', price: money(5500, 'GBP'), totalInventory: 500, availableInventory: 240 },
      { id: 's3', eventId: id, name: 'Restricted view', price: money(2500, 'GBP'), totalInventory: 50, availableInventory: 0 },
    ],
  };
}

export class DemoEventRepository implements EventRepository {
  async listEvents(): Promise<Outcome<EventPage>> {
    await sleep(300);
    return ok({ events: demoEvents, nextCursor: null });
  }
  async getEvent(id: string): Promise<Outcome<EventDetail>> {
    await sleep(200);
    return ok(detail(id));
  }
}

export class DemoQueueRepository implements QueueRepository {
  private polls = 0;
  async join(eventId: string): Promise<Outcome<QueueToken>> {
    await sleep(300);
    return ok({ id: 'q1', userId: 'u1', eventId, position: 3, status: 'waiting', admittedAt: null });
  }
  async status(eventId: string): Promise<Outcome<QueueToken>> {
    this.polls += 1;
    if (this.polls >= 3) return ok({ id: 'q1', userId: 'u1', eventId, position: 0, status: 'admitted', admittedAt: new Date() });
    return ok({ id: 'q1', userId: 'u1', eventId, position: 3 - this.polls, status: 'waiting', admittedAt: null });
  }
}

export class DemoReservationRepository implements ReservationRepository {
  async create(sectorId: string, quantity: number): Promise<Outcome<Reservation>> {
    await sleep(300);
    return ok({ id: 'r1', userId: 'u1', sectorId, quantity, status: 'held', expiresAt: new Date(Date.now() + 120000) });
  }
  async release(): Promise<Outcome<void>> {
    return ok(undefined);
  }
}

export class DemoOrderRepository implements OrderRepository {
  private polls = 0;
  async create(reservationId: string): Promise<Outcome<Order>> {
    await sleep(400);
    return ok({ id: 'o1', reservationId, userId: 'u1', amountCents: 9500, status: 'pending', createdAt: new Date() });
  }
  async get(id: string): Promise<Outcome<Order>> {
    this.polls += 1;
    const status = this.polls >= 3 ? 'paid' : 'pending';
    return ok({ id, reservationId: 'r1', userId: 'u1', amountCents: 9500, status, createdAt: new Date() });
  }
}

export class DemoIdempotencyKeyFactory implements IdempotencyKeyFactory {
  private n = 0;
  newKey(): string {
    this.n += 1;
    return `demo-idem-${this.n}`;
  }
}
