# Flutter client

The ticketing client in Flutter. State in Bloc/Cubit, networking via `dio` over models
generated from the contract, server-state held in a repository cache.

## Status

Skeleton only. This README and the folder exist; no Dart has been written yet. The
shared assets it will consume are ready in [`/shared`](../../shared/).

## Version floor

Pin the latest **stable** at scaffold time. The floor below is the reference from the
master spec, not a claim about today's newest release. Verify against the stable channel
and record the resolved versions here once the project is generated.

| Concern | Floor |
|---|---|
| Flutter | 3.44.x (stable) |
| Dart | 3.12.x |
| State (Bloc/Cubit or Riverpod) | latest stable |
| `dio` | latest stable |
| `flutter_secure_storage` | latest stable |
| Previews (`@Preview` / widgetbook) | latest stable |

Resolved versions: _to be recorded when the project is scaffolded._

## Intended structure

```
lib/
  ui/            atoms → molecules → organisms → templates → pages (widgets)
  state/         Blocs/Cubits
  usecase/       pure business logic, no Flutter imports, unit-testable
  repository/    ports (abstract classes) + DTO → domain mapping
  data/          dio adapter → gateway base URL, interceptors
  di/            wiring, base URL injection
test/            use-case + repository tests keyed to /shared/scenarios
```

Previews use the platform preview mechanism (`@Preview` / widgetbook) so every
atom/molecule/organism renders in isolation across its states. See
[`docs/client-architecture.md`](../../docs/client-architecture.md).
