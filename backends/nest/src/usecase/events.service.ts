import { Errors } from '../domain/errors';
import { Event, Sector } from '../domain/models';
import { EventRepository, SectorRepository } from './ports';

export interface EventDetail {
  event: Event;
  sectors: Sector[];
}

export class EventService {
  constructor(
    private readonly events: EventRepository,
    private readonly sectors: SectorRepository,
  ) {}

  async list(cursor: string, limit: number): Promise<{ events: Event[]; nextCursor: string }> {
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
