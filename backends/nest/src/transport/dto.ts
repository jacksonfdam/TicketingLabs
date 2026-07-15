// Response mappers producing the exact wire shape from contract/openapi.yaml:
// snake_case fields, RFC3339 timestamps. Keeping this explicit avoids surprises from
// automatic serialisation and keeps the domain (camelCase) separate from the wire.

import { Event, Order, QueueToken, Reservation, Sector } from '../domain/models';
import { EventDetail } from '../usecase/events.service';
import { TokenPair } from '../usecase/auth.service';

const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);

export const tokenPairDto = (p: TokenPair) => ({
  access_token: p.accessToken,
  refresh_token: p.refreshToken,
  token_type: 'Bearer',
  expires_in: p.expiresIn,
});

export const eventDto = (e: Event) => ({
  id: e.id,
  name: e.name,
  venue: e.venue,
  starts_at: iso(e.startsAt),
  sales_open_at: iso(e.salesOpenAt),
  status: e.status,
});

export const sectorDto = (s: Sector) => ({
  id: s.id,
  event_id: s.eventId,
  name: s.name,
  price_cents: s.priceCents,
  currency: s.currency,
  total_inventory: s.totalInventory,
  available_inventory: s.availableInventory,
});

export const eventDetailDto = (d: EventDetail) => ({
  ...eventDto(d.event),
  sectors: d.sectors.map(sectorDto),
});

export const eventPageDto = (events: Event[], nextCursor: string) => ({
  data: events.map(eventDto),
  next_cursor: nextCursor || null,
});

export const queueTokenDto = (t: QueueToken) => ({
  id: t.id,
  user_id: t.userId,
  event_id: t.eventId,
  position: t.position,
  status: t.status,
  admitted_at: iso(t.admittedAt),
});

export const reservationDto = (r: Reservation) => ({
  id: r.id,
  user_id: r.userId,
  sector_id: r.sectorId,
  quantity: r.quantity,
  status: r.status,
  expires_at: iso(r.expiresAt),
});

export const orderDto = (o: Order) => ({
  id: o.id,
  reservation_id: o.reservationId,
  user_id: o.userId,
  amount_cents: o.amountCents,
  status: o.status,
  created_at: iso(o.createdAt),
});
