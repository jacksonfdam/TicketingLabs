# React Native client — Expo

The ticketing client in React Native on Expo. State in zustand plus hooks, server-state
reads through TanStack Query, HTTP via `ky`, types validated defensively at the boundary.

## Status

Complete and verified headlessly. `npm run typecheck` is clean, `npm test` runs 17 unit
tests green (use cases, defensive mapping, stores), and `npx expo export --platform ios`
Metro-bundles the whole app (643 modules). Running it interactively on a simulator is a
`npx expo run:ios` / `run:android` away but not required for the verification bar here.

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
  presentation/  zustand stores (waiting/reservation/order) + TanStack Query reads [tested]
  ui/            theme (tokens), atoms, components, screens, gallery
  demo/          in-memory repositories for the runnable demo
App.tsx          composition root: QueryClientProvider + flow navigation + gallery tab
```

Commands: `npm test`, `npm run typecheck`, `npm start` (Expo dev server),
`npx expo run:ios` / `run:android` (native run). See
[docs/client-architecture.md](../../docs/client-architecture.md).
