# React Native client — Expo (managed)

The ticketing client in React Native on Expo, New Architecture only. State in hooks plus
a Zustand store, server-state in TanStack Query, types generated from the contract.

## Status

Skeleton only. This README and the folder exist; no TypeScript has been written yet. The
shared assets it will consume are ready in [`/shared`](../../shared/).

## Version floor

Pin the latest **stable** at scaffold time. The floor below is the reference from the
master spec, not a claim about today's newest release. Verify against the stable releases
and record the resolved versions here once the project is generated. The old architecture
is retired — do **not** enable it.

| Concern | Floor |
|---|---|
| React Native | 0.84.x, New Architecture (Fabric + TurboModules + JSI), Hermes V1 |
| Expo SDK | latest stable |
| State (hooks + Zustand) | latest stable |
| Server-state (TanStack Query) | latest stable |
| HTTP (`ky` / `fetch`) | latest stable |
| Types (`openapi-typescript`) | latest stable |
| Secure storage (`expo-secure-store`) | latest stable |
| Lists (FlashList), animation (Reanimated) | latest stable |
| Previews (Storybook for React Native) | latest stable |

Resolved versions: _to be recorded when the project is scaffolded._

## Intended structure

```
src/
  ui/            atoms → molecules → organisms → templates → screens
  state/         Zustand stores + hooks
  usecase/       pure business logic, no React, unit-testable
  repository/    ports (interfaces) + DTO → domain mapping
  data/          ky/fetch adapter → gateway base URL, middleware
  di/            wiring, base URL injection (Expo config / env)
__tests__/       use-case + repository tests keyed to /shared/scenarios
.storybook/      preview catalog across component states
```

Previews use Storybook for React Native so every atom/molecule/organism renders in
isolation across its states. See [`docs/client-architecture.md`](../../docs/client-architecture.md).
