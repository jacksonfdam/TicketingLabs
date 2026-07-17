# Recipe: the injected base URL (and a reachability probe that can't hang)

Cross-platform: Kotlin Multiplatform, Flutter, React Native.

## Problem

The client must talk to the API Gateway and nothing else. It cannot know, or care, which
backend answers — Go, Laravel, Nest, or a fake. And when the gateway is down or the phone is
offline, the app must say so quickly, not spin a loader until the heat death of the battery.

## Concept

Two rules. First, the base URL is **configuration**, held in exactly one place per app, and
it is the *only* thing the app knows about the backend. There is no `if backend == …`
anywhere, because there is nothing to branch on. Second, connectivity is a **bounded probe**:
one short, timed `GET /health` that always resolves to online or offline. A check that can
hang is not a check; it is a spinner with ambitions.

## Implementation ×3

**KMP** — `apps/kmp/sharedUI/src/commonMain/kotlin/com/ticketinglabs/client/config/AppConfig.kt`

```kotlin
object AppConfig {
    const val DEFAULT_BASE_URL = "https://localhost/api"   // the only backend knowledge
    const val REACHABILITY_TIMEOUT_MS = 4_000L
}
```

The probe (`data/health/HttpReachabilityChecker.kt`) uses whatever engine is on the classpath
(OkHttp on Android, Darwin on iOS) and never throws:

```kotlin
override suspend fun isServerReachable(): Boolean = try {
    client.get("${base}health").status.isSuccess()
} catch (e: CancellationException) { throw e } catch (_: Throwable) { false }
```

**Flutter** — `apps/flutter/lib/config/app_config.dart`

```dart
class AppConfig {
  static const String baseUrl =
      String.fromEnvironment('BASE_URL', defaultValue: 'https://localhost/api');
  static const Duration reachabilityTimeout = Duration(seconds: 4);
}
```

The probe (`lib/data/reachability.dart`) is a `dio` GET with a short timeout, `catch` → `false`.

**React Native** — `apps/react-native/src/config/appConfig.ts`

```ts
export const AppConfig = {
  baseUrl: process.env.EXPO_PUBLIC_BASE_URL ?? 'https://localhost/api',
  reachabilityTimeoutMs: 4000,
} as const;
```

The probe (`src/data/reachability.ts`) is a `ky` GET with `timeout`, `throwHttpErrors: false`,
`retry: 0`, `catch` → `false`.

In all three, a tiny state holder (`ConnectivityViewModel` / `ConnectivityCubit` /
`connectivityStore`) turns the probe into `checking → online | offline`, and a banner renders it.

## Comparison

- **KMP** injects at compile time via a constant; there is no ambient env, so overriding means
  editing `AppConfig` (or wiring a `BuildConfig`/expect-actual, out of scope here).
- **Flutter** has the nicest override story: `--dart-define=BASE_URL=…` with a compile-time
  default, no code change.
- **React Native** reads `process.env.EXPO_PUBLIC_BASE_URL`, resolved by Expo at bundle time —
  ergonomic, but "env var" on a mobile bundle is really a build-time constant, not a runtime one.

## How to see it work

Run any app with no backend up: the banner settles on "Server unreachable — working offline"
within ~4s and the flow still renders from local state. Start the backend lab
(`make up`) and hit Retry: it flips to online. On an Android emulator set the base URL to
`https://10.0.2.2/api` — `localhost` there is the emulator, not your machine.

## Trade-offs

Compile-time configuration is simple and tamper-resistant but needs a rebuild to change; a
runtime config screen would be friendlier for QA and is the obvious next increment. The
reachability probe is a liveness check, not a full connectivity stack — it does not subscribe
to OS network changes (that is `NetworkCallback` / `connectivity_plus` / `NetInfo` territory).
For a lab that wants "is the server there, yes or no, now" without platform plugins, one timed
GET is the honest minimum.
