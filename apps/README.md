# /apps — the three clients

The same ticketing client, built three times, so you can compare how each platform solves
the same problems. Same contract, same seven-screen flow, same states. From the user's side
they are indistinguishable. From the developer's side, that is the exhibit.

| App | Stack | Status |
|---|---|---|
| [`kmp/`](kmp/README.md) | Kotlin Multiplatform + Compose Multiplatform | built, verified (iOS/Android compile, 41 host tests, Android APK) |
| [`flutter/`](flutter/README.md) | Flutter + Dart | built, verified (analyze clean, 33 tests, web build) |
| [`react-native/`](react-native/README.md) | Expo, New Architecture | built, verified (typecheck clean, 25 tests) |

Each app's own README has the specifics. In short:

**How to run** — see the "Run" section of each app's README:
[kmp](kmp/README.md) · [flutter](flutter/README.md) · [react-native](react-native/README.md).

**Where to set the endpoint** — one place per app, all pointing at the API Gateway:

| App | Configure at |
|---|---|
| KMP | `sharedUI/.../config/AppConfig.kt` (`DEFAULT_BASE_URL`) |
| Flutter | `lib/config/app_config.dart` (or `--dart-define=BASE_URL=...`) |
| React Native | `src/config/appConfig.ts` (or `EXPO_PUBLIC_BASE_URL=...`) |

Prefer an **external HTTPS tunnel** over a local IP so any device (real phone included) can
reach the gateway: `make up`, then `make tunnel` (ngrok) or `cloudflared tunnel --url
http://localhost:80`, and point each client at `https://<tunnel-host>/api`. Never consume the
local IP. See [the tunnel recipe](../docs/recipes/expose-with-a-tunnel.md). (Dev-only, same
machine: `https://localhost/api`; an Android emulator would need `https://10.0.2.2/api` — neither
reaches a real device.)

**Demo vs real backend.** By default each app runs on in-memory demo data (works with no
server). To consume the real gateway — real HTTP repositories, a session with refresh
rotation, and a login screen — flip one flag: KMP `AppConfig.USE_REAL_BACKEND = true`,
Flutter `--dart-define=USE_REAL_BACKEND=true`, React Native `EXPO_PUBLIC_USE_REAL_BACKEND=true`.
Seeded demo login: `buyer@ticketing.local` / `password123`. In real mode the refresh token is
kept in the platform secure store (iOS Keychain, Android EncryptedSharedPreferences/Keystore,
`expo-secure-store`) behind one `TokenStore` port, so a signed-in session survives a restart.

**Offline-first, no infinite loading** — all three behave the same way: on start (and on
Retry) a bounded reachability probe hits `{baseUrl}/health` with a short timeout and resolves
to online/offline — it never hangs. A banner surfaces server status; the flow renders from
local state and stays usable offline. Every network call carries a timeout, so each async
state resolves into Success / Empty / Error / Timeout — never an endless spinner.

Each app is blind to the backend: it receives a base URL and consumes
[`/shared/contract`](../shared/contract/). It shares [tokens](../shared/tokens/),
[scenarios](../shared/scenarios/) and [copy](../shared/copy/) with its siblings and shares no
source code with them. See [`docs/client-architecture.md`](../docs/client-architecture.md).
