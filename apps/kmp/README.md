# KMP client — Compose Multiplatform

The ticketing client in Kotlin Multiplatform with shared Compose UI. Business logic and
UI both live in `commonMain`; platform code is confined to the edges (secure storage,
TLS pinning, entry points).

## Status

Skeleton only. This README and the folder exist; no Kotlin has been written yet. The
shared assets it will consume are ready in [`/shared`](../../shared/).

## Version floor

Pin the latest **stable** at scaffold time. The floor below is the reference from the
master spec, not a claim about today's newest release. Verify against the stable channels
and record the resolved versions here once the project is generated. Do **not** use EAP /
beta Compose Multiplatform.

| Concern | Floor |
|---|---|
| Compose Multiplatform | 1.11.x (stable channel) |
| Kotlin | 2.4.x |
| Coroutines / `StateFlow` | latest stable |
| Ktor client | latest stable |
| kotlinx.serialization | latest stable |
| Multiplatform settings + Keychain/Keystore | latest stable |

Resolved versions: _to be recorded when the project is scaffolded._

## Intended structure

```
commonMain/
  ui/            atoms → molecules → organisms → templates → pages (Compose)
  state/         ViewModels + StateFlow
  usecase/       pure business logic, unit-testable, no Compose
  repository/    ports (interfaces) + DTO → domain mapping
  data/          Ktor adapter → gateway base URL, interceptors
  di/            wiring, base URL injection
androidMain/, iosMain/, desktopMain/  platform actuals (secure store, pinning, entry)
commonTest/      use-case + repository tests keyed to /shared/scenarios
```

Previews use `@Preview` in `commonMain` so every atom/molecule/organism renders in
isolation across its states. See [`docs/client-architecture.md`](../../docs/client-architecture.md).
