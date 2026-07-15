import { DomainError, Errors } from '../domain/errors';
import { Order, OrderStatus, ReservationStatus } from '../domain/models';
import {
  IdGenerator,
  OrderRepository,
  Publisher,
  ReservationRepository,
  SectorRepository,
} from './ports';

// The broker topic a new order publishes to. The payment worker consumes it and calls
// the external gateway, which is what makes payment asynchronous.
export const TOPIC_PAYMENT_REQUESTED = 'payment.requested';

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

    // A failed publish is recoverable by reconciliation; the order is already pending,
    // so we do not fail the request over it.
    try {
      await this.publisher.publish(TOPIC_PAYMENT_REQUESTED, Buffer.from(JSON.stringify({ order_id: order.id })));
    } catch {
      // swallow: order exists and is pending
    }
    return order;
  }

  async get(id: string): Promise<Order> {
    const order = await this.orders.findById(id);
    if (!order) throw Errors.NotFound;
    return order;
  }
}
