// Defensive DTO→domain mapping. Every function validates raw JSON and throws MappingError
// on anything untrusted: a missing field, a wrong type, an unknown enum, an unparseable
// date, or a domain-invariant violation. The executor turns that into MalformedResponse.

import {
  Event,
  EventDetail,
  EventPage,
  EventStatus,
  money,
  Order,
  OrderStatus,
  QueueStatus,
  QueueToken,
  Reservation,
  ReservationStatus,
  Sector,
  sector,
  TokenPair,
} from '../domain/models';
import type { EventDto, OrderDto, QueueTokenDto, ReservationDto } from '../contract/dto';

export class MappingError extends Error {}

type Json = Record<string, unknown>;

function asObject(json: unknown): Json {
  if (typeof json === 'object' && json !== null && !Array.isArray(json)) return json as Json;
  throw new MappingError('expected a JSON object');
}

function str(json: Json, key: string): string {
  const v = json[key];
  if (typeof v === 'string') return v;
  throw new MappingError(`missing or non-string field '${key}'`);
}

function int(json: Json, key: string): number {
  const v = json[key];
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  throw new MappingError(`missing or non-integer field '${key}'`);
}

function strOrNull(json: Json, key: string): string | null {
  const v = json[key];
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  throw new MappingError(`non-string field '${key}'`);
}

function date(json: Json, key: string): Date {
  const raw = str(json, key);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new MappingError(`unparseable timestamp '${raw}' in '${key}'`);
  return d;
}

function guarded<T>(build: () => T): T {
  try {
    return build();
  } catch (e) {
    if (e instanceof MappingError) throw e;
    throw new MappingError(e instanceof Error ? e.message : 'domain invariant violated');
  }
}

// The enum maps are typed against the GENERATED contract unions (EventDto['status'], …). If
// the contract ever adds or renames a status, these object literals stop being exhaustive and
// the app fails to compile until the new case is handled. That is the payoff of the codegen.
const EVENT_STATUS: Record<EventDto['status'], EventStatus> = { draft: 'draft', on_sale: 'onSale', sold_out: 'soldOut', closed: 'closed' };
const QUEUE_STATUS: Record<QueueTokenDto['status'], QueueStatus> = { waiting: 'waiting', admitted: 'admitted', expired: 'expired' };
const RESERVATION_STATUS: Record<ReservationDto['status'], ReservationStatus> = { held: 'held', confirmed: 'confirmed', released: 'released', expired: 'expired' };
const ORDER_STATUS: Record<OrderDto['status'], OrderStatus> = { pending: 'pending', paid: 'paid', failed: 'failed', refunded: 'refunded' };

function mapEnum<K extends string, T>(table: Record<K, T>, raw: string, what: string): T {
  if (raw in table) return table[raw as K];
  throw new MappingError(`unknown ${what} '${raw}'`);
}

export function eventFromJson(json: unknown): Event {
  const m = asObject(json);
  return {
    id: str(m, 'id'),
    name: str(m, 'name'),
    venue: str(m, 'venue'),
    startsAt: date(m, 'starts_at'),
    salesOpenAt: date(m, 'sales_open_at'),
    status: mapEnum(EVENT_STATUS, str(m, 'status'), 'event status'),
  };
}

export function sectorFromJson(json: unknown): Sector {
  const m = asObject(json);
  return guarded(() =>
    sector({
      id: str(m, 'id'),
      eventId: str(m, 'event_id'),
      name: str(m, 'name'),
      price: money(int(m, 'price_cents'), str(m, 'currency')),
      totalInventory: int(m, 'total_inventory'),
      availableInventory: int(m, 'available_inventory'),
    }),
  );
}

export function eventDetailFromJson(json: unknown): EventDetail {
  const m = asObject(json);
  const sectors = m['sectors'];
  if (!Array.isArray(sectors)) throw new MappingError('missing sectors');
  return { event: eventFromJson(m), sectors: sectors.map(sectorFromJson) };
}

export function eventPageFromJson(json: unknown): EventPage {
  const m = asObject(json);
  const data = m['data'];
  if (!Array.isArray(data)) throw new MappingError('missing data');
  return { events: data.map(eventFromJson), nextCursor: strOrNull(m, 'next_cursor') };
}

export function queueTokenFromJson(json: unknown): QueueToken {
  const m = asObject(json);
  return {
    id: str(m, 'id'),
    userId: str(m, 'user_id'),
    eventId: str(m, 'event_id'),
    position: int(m, 'position'),
    status: mapEnum(QUEUE_STATUS, str(m, 'status'), 'queue status'),
    admittedAt: m['admitted_at'] == null ? null : date(m, 'admitted_at'),
  };
}

export function reservationFromJson(json: unknown): Reservation {
  const m = asObject(json);
  return guarded(() => ({
    id: str(m, 'id'),
    userId: str(m, 'user_id'),
    sectorId: str(m, 'sector_id'),
    quantity: int(m, 'quantity'),
    status: mapEnum(RESERVATION_STATUS, str(m, 'status'), 'reservation status'),
    expiresAt: date(m, 'expires_at'),
  }));
}

export function orderFromJson(json: unknown): Order {
  const m = asObject(json);
  return {
    id: str(m, 'id'),
    reservationId: str(m, 'reservation_id'),
    userId: str(m, 'user_id'),
    amountCents: int(m, 'amount_cents'),
    status: mapEnum(ORDER_STATUS, str(m, 'status'), 'order status'),
    createdAt: date(m, 'created_at'),
  };
}

export function tokenPairFromJson(json: unknown): TokenPair {
  const m = asObject(json);
  return {
    accessToken: str(m, 'access_token'),
    refreshToken: str(m, 'refresh_token'),
    expiresInSeconds: int(m, 'expires_in'),
  };
}
