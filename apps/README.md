# /apps — the three clients

The same ticketing client, built three times, so you can compare how each platform solves
the same problems. Same contract, same seven-screen flow, same states. From the user's side
they are indistinguishable. From the developer's side, that is the exhibit.

| App | Stack | Status |
|---|---|---|
| [`kmp/`](kmp/README.md) | Kotlin Multiplatform + Compose Multiplatform | built, verified (iOS/Android compile, 35 host tests, Android APK) |
| [`flutter/`](flutter/README.md) | Flutter + Dart | built, verified (analyze clean, 23 tests, web build) |
| [`react-native/`](react-native/README.md) | Expo, New Architecture | built, verified (typecheck clean, 19 tests) |

Each app's own README has the specifics. In short:

**How to run** — see the "Run" section of each app's README:
[kmp](kmp/README.md) · [flutter](flutter/README.md) · [react-native](react-native/README.md).

**Where to set the endpoint** — one place per app, all pointing at the API Gateway
(`https://localhost/api` by default; on an Android emulator use `https://10.0.2.2/api`):

| App | Configure at |
|---|---|
| KMP | `sharedUI/.../config/AppConfig.kt` (`DEFAULT_BASE_URL`) |
| Flutter | `lib/config/app_config.dart` (or `--dart-define=BASE_URL=...`) |
| React Native | `src/config/appConfig.ts` (or `EXPO_PUBLIC_BASE_URL=...`) |

**Offline-first, no infinite loading** — all three behave the same way: on start (and on
Retry) a bounded reachability probe hits `{baseUrl}/health` with a short timeout and resolves
to online/offline — it never hangs. A banner surfaces server status; the flow renders from
local state and stays usable offline. Every network call carries a timeout, so each async
state resolves into Success / Empty / Error / Timeout — never an endless spinner.

Each app is blind to the backend: it receives a base URL and consumes
[`/shared/contract`](../shared/contract/). It shares [tokens](../shared/tokens/),
[scenarios](../shared/scenarios/) and [copy](../shared/copy/) with its siblings and shares no
source code with them. See [`docs/client-architecture.md`](../docs/client-architecture.md).
