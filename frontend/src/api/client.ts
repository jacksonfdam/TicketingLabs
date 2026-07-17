// The typed API client. Types come from src/api/schema.d.ts, which is GENERATED from
// contract/openapi.yaml (npm run generate) — never hand-written. The client talks only
// to the gateway, so it has no idea which backend answers. That is the point.
//
// The base URL defaults to the same-origin "/api" (the SPA and the gateway share an origin
// in docker-compose). Set VITE_API_BASE_URL to consume an external HTTPS tunnel instead —
// e.g. VITE_API_BASE_URL=https://<subdomain>.ngrok-free.app/api — so the app never depends
// on a local IP. See docs/recipes/expose-with-a-tunnel.md.

import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { authFetch } from '../auth/session';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const api = createClient<paths>({
  baseUrl,
  fetch: authFetch as typeof fetch,
});

// A small helper: openapi-fetch returns { data, error }; throw on error so TanStack
// Query treats it as a failed query/mutation.
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || result.data === undefined) {
    const err = result.error as { error?: { message?: string } } | undefined;
    throw new Error(err?.error?.message ?? `Request failed (${result.response.status})`);
  }
  return result.data;
}
