import { Errors } from '../domain/errors';
import { OrderStatus, PaymentStatus, ReservationStatus } from '../domain/models';
import {
  IdGenerator,
  OrderRepository,
  PaymentGateway,
  PaymentRepository,
  ReservationRepository,
} from './ports';

export class PaymentService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly reservations: ReservationRepository,
    private readonly payments: PaymentRepository,
    private readonly gateway: PaymentGateway,
    private readonly ids: IdGenerator,
  ) {}

  // Called by the broker worker per payment.requested message. Records a pending
  // payment and asks the gateway to charge; the result arrives via the webhook.
  async processPaymentRequest(orderId: string): Promise<void> {
    const order = await this.orders.findById(orderId);
    if (!order) throw Errors.NotFound;
    if (order.status !== OrderStatus.Pending) return; // already settled; duplicate message
    const providerRef = await this.gateway.charge(orderId); // may throw; worker retries
    await this.payments.upsert({
      id: this.ids.newId(),
      orderId,
      providerRef,
      status: PaymentStatus.Pending,
      attempts: 1,
    });
  }

  // Settle an order from a verified provider callback. Signature verification happens
  // at the transport edge. Idempotent by provider_ref.
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

    if (order.status !== OrderStatus.Pending) return; // already settled

    if (succeeded) {
      await this.orders.updateStatus(orderId, OrderStatus.Paid);
      // The one place the two state machines touch: a paid order confirms its hold.
      await this.reservations.updateStatus(order.reservationId, ReservationStatus.Confirmed);
    } else {
      await this.orders.updateStatus(orderId, OrderStatus.Failed);
    }
  }
}
