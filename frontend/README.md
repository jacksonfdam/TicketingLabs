# Frontend

A React + Vite + TypeScript SPA. It talks to exactly one host — the gateway, at `/api`
— and has no idea which of the seven backends answers. There is no `if (backend === …)`
anywhere, and there never will be. Switching backends is an infra change; this code does
not move.

## Backend-agnostic by construction

- The API client's types are **generated** from `contract/openapi.yaml`
  (`npm run generate` → `src/api/schema.d.ts`), never hand-written. If the contract
  changes, the types change, and the compiler finds every call that no longer fits.
- The client (`openapi-fetch`) is pointed at `/api`. In dev, Vite proxies `/api` to the
  gateway; in production the SPA is served behind the same gateway origin, so `/api` is
  same-origin — no CORS, and no way for the frontend to address a specific backend.

## The flow

Events list → waiting room (poll queue position until admitted) → sector selection →
reservation with a live expiry countdown → checkout → order status (polls until paid).
Verified end-to-end in a browser against the live stack.

## Performance

- **Code splitting**: each route (`EventsPage`, `EventPage`, `OrderPage`) is a lazy
  chunk; vendor libraries (`react`, `@tanstack/react-query`) are split so app changes do
  not bust their long-cached chunks.
- **Client cache**: TanStack Query with `staleTime` aligned to the API's `Cache-Control`
  (events 30s, event detail 5s), plus targeted invalidation after a reservation.
- **Polling** drives the two async surfaces (queue admission, order settlement) and
  stops as soon as the terminal state is reached.
- **Immutable assets**: hashed filenames served with `Cache-Control: public, immutable`.
- Skeletons cover the initial loads.

## Security

- **Tokens live in memory only** (`src/auth/session.ts`) — never localStorage or
  sessionStorage, so an XSS payload cannot read them from persistent storage. A reload
  drops them and you log in again; production would keep the refresh token in an HttpOnly
  cookie. Refresh rotation is handled by a custom fetch that retries once on a 401.
- **CSP** and other security headers are set by the SPA's nginx (`nginx.conf`):
  `default-src 'self'`, connections to self only.
- **No secrets in the bundle**: the only config is the relative `/api` base.

## Develop / build

```bash
npm install
npm run generate     # regenerate the typed client from the contract
npm run dev          # Vite dev server on :3000, proxying /api to the gateway
npm run typecheck
npm run build        # hashed, code-split production bundle in dist/
```

Served in the stack by nginx behind the gateway; open http://localhost/ after `make up`.

## Version note

`typescript` is pinned to the 5.9 line because `openapi-typescript` still peers on
TypeScript 5.x. Vite is 8.1 (Rolldown bundler — `manualChunks` is configured as a
function, which is what Rolldown expects).
