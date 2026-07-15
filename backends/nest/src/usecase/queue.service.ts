import { Errors } from '../domain/errors';
import { QueueStatus, QueueToken } from '../domain/models';
import {
  Clock,
  EventRepository,
  IdGenerator,
  QueueRepository,
  RateLimiter,
} from './ports';

// The pressure valve. Only an admitted token may proceed to checkout; that gate is
// enforced by ReservationService via isAdmitted.
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

    if (!(await this.limiter.allow(`queue_join:${userId}:${eventId}`, 5, 60))) {
      throw Errors.RateLimited;
    }

    const existing = await this.queue.find(userId, eventId);
    if (existing) return this.decorate(existing);

    const position = await this.queue.nextPosition(eventId);
    const token: QueueToken = {
      id: this.ids.newId(),
      userId,
      eventId,
      position,
      status: QueueStatus.Waiting,
      admittedAt: null,
    };
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
