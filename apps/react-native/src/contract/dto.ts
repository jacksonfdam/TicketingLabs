// Wire DTOs, generated from the OpenAPI contract (see schema.ts, produced by
// `npm run generate:contract`). These are the shapes the gateway sends; the mappers validate
// them at runtime and turn them into the validated domain models. Nothing here is hand-typed.

import type { components } from './schema';

export type EventDto = components['schemas']['Event'];
export type SectorDto = components['schemas']['Sector'];
export type EventDetailDto = components['schemas']['EventDetail'];
export type EventPageDto = components['schemas']['EventPage'];
export type QueueTokenDto = components['schemas']['QueueToken'];
export type ReservationDto = components['schemas']['Reservation'];
export type OrderDto = components['schemas']['Order'];
export type TokenPairDto = components['schemas']['TokenPair'];
export type ErrorEnvelopeDto = components['schemas']['ErrorEnvelope'];
