# React Native client — Expo

The ticketing client in React Native on Expo. State in zustand plus hooks, server-state
reads through TanStack Query, HTTP via `ky`, types validated defensively at the boundary.

## Status

Complete and verified headlessly. `npm run typecheck` is clean and `npm test` runs 19 unit
tests green (use cases, defensive mapping, stores, connectivity). Running it interactively on
a simulator is a `npx expo run:ios` / `run:android` away.

## Run

```bash
npm install
npm test                 # unit tests (19)
npm run typecheck        # tsc --noEmit
npx expo start           # dev server (press i / a for simulator/emulator, w for web)
npx expo run:ios         # native iOS build+run
npx expo run:android     # native Android build+run
```

## Endpoint configuration

One place: [`src/config/appConfig.ts`](src/config/appConfig.ts). The default is the backend
lab's local gateway; override without editing code via an Expo public env var:

```bash
EXPO_PUBLIC_BASE_URL=https://10.0.2.2/api npx expo start
```

`https://localhost/api` is the gateway on web; on an Android emulator the host is `10.0.2.2`.
The app knows nothing else about the backend.

## Offline-first & connectivity

No endless spinners. Two guarantees:

- **Bounded reachability.** On mount (and on Retry) `KyReachabilityChecker` does one short,
  timed `GET /health`; the connectivity store resolves `checking` to `online`/`offline`
  within `AppConfig.reachabilityTimeoutMs` — it cannot hang. An app-wide banner shows status
  and offers Retry when offline.
- **Offline-first.** The flow renders from local state and stays usable with no server; the
  banner only informs. `ky` sets a request timeout and TanStack Query bounds its retries, so
  each async state resolves into a modelled state, never a spinner with no end.

## Versions

Resolved at scaffold time (Expo SDK 57):

| Concern | Pinned |
|---|---|
| React Native | 0.86.0, New Architecture (Fabric + TurboModules), Hermes |
| Expo SDK | 57 |
| React | 19.2.3 |
| State | zustand 5 (vanilla stores) |
| Server-state | @tanstack/react-query 5 |
| HTTP | ky 1.7 |
| Tests | jest 30 + @swc/jest (fast, TS-version-agnostic) |

Note: the tests run under `@swc/jest` rather than `jest-expo`. The logic layers are pure
TypeScript (no React Native imports), so they need no RN test environment; `@swc/jest`
transpiles them without the version friction of the expo preset against React 19.

## Structure

```
src/
  core/          Outcome result type, AppError taxonomy, UiState, logger
  domain/        validated models, repository ports, use cases            [tested]
  data/          ky adapter, defensive mappers, error mapper, repos        [mappers tested]
  presentation/  zustand stores (waiting/reservation/order/connectivity) + TanStack Query reads [tested]
  ui/            theme (tokens), atoms, components, screens, gallery, connectivity banner
  config/        appConfig.ts — the base URL
  demo/          in-memory repositories for the runnable demo
App.tsx          composition root: QueryClientProvider + connectivity banner + flow + gallery tab
```

Commands: `npm test`, `npm run typecheck`, `npm start` (Expo dev server),
`npx expo run:ios` / `run:android` (native run). See
[docs/client-architecture.md](../../docs/client-architecture.md).
