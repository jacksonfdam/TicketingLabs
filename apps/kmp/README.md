# KMP client — Compose Multiplatform

The ticketing client in Kotlin Multiplatform with shared Compose UI, laid out to match the
official Compose Multiplatform template (`apps/template`): one shared module plus a thin
native app per platform.

## Structure

```
:sharedUI            KMP Compose module. Targets: android + iosArm64 + iosSimulatorArm64.
  src/commonMain/kotlin/com/ticketinglabs/client/
    core/        Outcome result type, AppError taxonomy, Recovery, UiState, Logger
    domain/      validated models, repository ports, use cases
    data/        Ktor adapter → gateway base URL, DTO → domain mapping, error mapping
    presentation/ multiplatform ViewModels + StateFlow (events, waiting, reservation, order)
    ui/          atoms → components → screens, tokens, gallery, @Preview catalog
    theme/       AppTheme + LocalThemeIsDark (dark/light), from the template
    demo/        in-memory repositories for the runnable demo
    App.kt       the composition root (builds the graph, drives the flow)
  src/commonTest/  use-case, domain, data (MockEngine) and ViewModel tests
  src/iosMain/kotlin/main.kt   MainViewController { App() }
:androidApp          com.android.application. AppActivity → App(). The launchable Android app.
iosApp/              Xcode project consuming the SharedUI framework.
```

The framework-free logic (core/domain/data/presentation) does not import Compose, so it is
unit-tested on the JVM via the Android host test. No Desktop target: the template targets
Android and iOS, and so does this.

## Status — verified

- `:sharedUI` compiles for **iosArm64** and **iosSimulatorArm64**.
- `:sharedUI:testAndroidHostTest` — **33 tests, 0 failures** (input hardening, the double-tap
  idempotency key, payment unknown-outcome reconcile-and-poll, the order reconciler, defensive
  deserialization and error mapping via Ktor MockEngine, and the ViewModel state machines).
- `:androidApp:assembleDebug` — builds `androidApp/build/outputs/apk/debug/androidApp-debug.apk`.

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
./gradlew :sharedUI:testAndroidHostTest                    # logic + ViewModel tests (33)
./gradlew :sharedUI:compileKotlinIosSimulatorArm64         # iOS compiles
./gradlew :androidApp:assembleDebug                        # build the Android APK
# iOS: open iosApp/iosApp.xcodeproj in Xcode and run.
```

## Endpoint configuration

One place, one constant:
[`sharedUI/src/commonMain/kotlin/com/ticketinglabs/client/config/AppConfig.kt`](sharedUI/src/commonMain/kotlin/com/ticketinglabs/client/config/AppConfig.kt)

```kotlin
object AppConfig {
    const val DEFAULT_BASE_URL = "https://localhost/api"   // <- point at your gateway
    const val REACHABILITY_TIMEOUT_MS = 4_000
}
```

The backend lab's gateway is `https://localhost/api`. On an Android emulator the host machine
is `https://10.0.2.2/api`, not `localhost`. The app knows nothing else about the backend.

## Offline-first & connectivity

The app never shows an endless spinner. Two guarantees:

- **Bounded reachability.** On start (and on Retry) a `ReachabilityChecker` does one short,
  timed `GET /health`. It resolves to ONLINE or OFFLINE within `REACHABILITY_TIMEOUT_MS` — it
  cannot hang. A banner shows "Checking connection…" briefly, then either clears (online) or
  shows "Server unreachable — working offline" with a Retry.
- **Offline-first.** The flow renders from local state and stays usable with no server; the
  banner informs, it never blocks. Every network call carries a request timeout, so each
  async state resolves into Success / Empty / Error / Timeout — never a spinner with no end.

## Versions

Aligned to `apps/template`. Pinned in [`gradle/libs.versions.toml`](gradle/libs.versions.toml).

| Concern | Pinned | Note |
|---|---|---|
| Kotlin | 2.4.0 | template |
| Compose Multiplatform | 1.11.1 | template; targets are iosArm64 + iosSimulatorArm64 (1.11.1 has no iosX64 klibs) |
| Compose Material 3 | 1.11.0-alpha07 | template pins material3 on its own line (the 1.11.x-compatible build) |
| Android Gradle Plugin | 9.0.0 | template |
| androidx.activity-compose | 1.12.0 | template |
| kotlinx.coroutines | 1.11.0 | template |
| Ktor client | 3.5.0 | template |
| kotlinx.serialization | 1.11.0 | template |
| org.jetbrains.androidx.lifecycle | 2.9.1 | added — the template has no ViewModels; this app does |
| Gradle (wrapper) | 9.5.1 | template |

Deviations from the template, kept minimal: the multiplatform `lifecycle-viewmodel` (the
app uses ViewModels), `withHostTest {}` on the android target (so the tests run fast on the
JVM), and `ktor-client-mock` for the data-layer tests. Removed as unnecessary: the Desktop
target, `navigation3`, `kotlinx-datetime`, `compose-resources` and the extra Ktor engines.

Previews use the unified `@Preview` (`androidx.compose.ui.tooling.preview.Preview`) in
`ui/Previews.kt`; the runnable `Gallery` renders every component across its states. See
[`docs/client-architecture.md`](../../docs/client-architecture.md).
