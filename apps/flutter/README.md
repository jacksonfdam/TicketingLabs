# Flutter client

The ticketing client in Flutter. State in Cubits (`flutter_bloc`), networking via `dio`,
the same seven-screen flow and layered architecture as the other two clients.

## Run

```bash
flutter pub get
flutter test                 # unit + widget tests (23)
flutter run                  # on a connected device/emulator/simulator
flutter run -d chrome        # or in the browser
flutter build apk            # Android APK
flutter build ios            # iOS (needs Xcode)
```

## Endpoint configuration

One place: [`lib/config/app_config.dart`](lib/config/app_config.dart). Point it at the gateway
through an external HTTPS **tunnel** — the address a real phone (and the emulator/simulator) can
reach and trust. Bring the tunnel up with `make up && make tunnel` (ngrok; Cloudflare Tunnel
works too), then inject its URL at build time — no code edit:

```bash
flutter run --dart-define=BASE_URL=https://<your-tunnel-host>/api
```

Never point a device at a local IP. `https://localhost/api` only works for the desktop/web
target on the same machine, and an Android emulator would need `https://10.0.2.2/api` — both are
dev-only conveniences, not for a device. See [the tunnel recipe](../../docs/recipes/expose-with-a-tunnel.md).
The app knows nothing else about the backend.

## Offline-first & connectivity

No endless spinners. Two guarantees:

- **Bounded reachability.** On start (and on Retry) `DioReachabilityChecker` does one short,
  timed `GET /health`; `ConnectivityCubit` resolves `checking` to `online`/`offline` within
  `AppConfig.reachabilityTimeout` — it cannot hang. An app-wide banner shows the status and
  offers Retry when offline.
- **Offline-first.** The flow renders from local state and stays usable with no server; the
  banner only informs. Every `dio` call sets connect/receive timeouts, so each async state
  resolves into a modelled state, never a spinner with no end.

## Structure

```
lib/
  core/          Outcome, AppError taxonomy, UiState, Recovery, Logger
  domain/        models, repository ports, use cases (no Flutter imports)
  data/          dio adapter → gateway base URL, defensive mappers, error mapper, reachability
  presentation/  Cubits (events, waiting, reservation, order, connectivity)
  ui/            widgets (atoms → organisms), screens, theme (tokens), gallery, banner
  config/        app_config.dart — the base URL
  demo/          in-memory repositories for the runnable demo
test/            use-case, mapper, cubit and widget tests
```

## Versions (resolved)

| Concern | Version |
|---|---|
| Flutter / Dart | as installed (stable channel) |
| flutter_bloc | ^9.1.1 |
| dio | ^5.9.0 |
| bloc_test / mocktail | dev |

Verified: `flutter analyze` clean, `flutter test` green (23), `flutter build web` succeeds.
See [`docs/client-architecture.md`](../../docs/client-architecture.md).
