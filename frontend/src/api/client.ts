// The typed API client. Types come from src/api/schema.d.ts, which is GENERATED from
// contract/openapi.yaml (npm run generate) — never hand-written. The client talks only
// to /api (the gateway), so it has no idea which backend answers. That is the point.

import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { authFetch } from '../auth/session';

export const api = createClient<paths>({
  baseUrl: '/api',
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
