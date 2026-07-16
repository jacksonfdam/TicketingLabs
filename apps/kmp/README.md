# KMP client — Compose Multiplatform

The ticketing client in Kotlin Multiplatform with shared Compose UI. Business logic and
UI both live in `commonMain`; platform code is confined to the edges (secure storage,
TLS pinning, entry points).

## Status

Complete and verified via Gradle. Two modules:

- `:shared` — the UI-free core, domain and data layers. Compiles and tests green on **JVM,
  Android and iOS** (`./gradlew :shared:allTests`); the JVM run alone is 23 tests covering
  input hardening, the double-tap idempotency key, the payment unknown-outcome mapping, the
  order reconciler, defensive deserialization and error mapping (Ktor MockEngine).
- `:composeApp` — the Compose Multiplatform UI. State holders (multiplatform `ViewModel`s),
  the design system, the seven screens, the unified `@Preview`s and the demo flow live in
  `commonMain` and are shared verbatim across **Android, iOS and Desktop**. Each platform
  contributes only a thin entry point: `desktopMain/Main.kt` (window), `androidMain/
  MainActivity.kt`, `iosMain/MainViewController.kt`. All three targets compile; Desktop is
  the target run headlessly, and 10 ViewModel checks run on it (`:composeApp:desktopTest`).

Toolchain: JDK 21 (Corretto), Gradle 9.4.1, Kotlin 2.4.10, AGP 9.2.1. JDK 25 is present but
Kotlin has no JDK 25 target yet, so the build runs on JDK 21.

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
./gradlew :shared:allTests                          # JVM + Android + iOS-sim (23 each)
./gradlew :composeApp:desktopTest                   # ViewModel tests on desktop (10)
./gradlew :composeApp:compileAndroidMain \
          :composeApp:compileKotlinIosSimulatorArm64 # mobile targets compile
./gradlew :composeApp:run                           # launch the desktop demo (needs a display)
```

## Versions

Pinned in [`gradle/libs.versions.toml`](gradle/libs.versions.toml). The core two were
verified as the latest **stable** in July 2026; the rest are conventional latest-stable
picks to confirm at first sync. Do **not** use EAP / beta Compose Multiplatform.

Pinned in [`gradle/libs.versions.toml`](gradle/libs.versions.toml):

| Concern | Pinned |
|---|---|
| Kotlin | 2.4.10 |
| Compose Multiplatform | 1.11.0 |
| Android Gradle Plugin | 9.2.1 |
| kotlinx.coroutines | 1.11.0 |
| kotlinx.serialization | 1.11.0 |
| Ktor client | 3.5.1 |
| org.jetbrains.androidx.lifecycle | 2.9.1 (stable; the CMP-shipped 2.11 is RC, excluded) |
| Gradle (wrapper) | 9.4.1 |

## Structure

Two modules, splitting UI-free logic from Compose UI so the logic tests on the JVM without
a simulator:

```
:shared                       UI-free: core, domain, data. Targets jvm + android + ios.
  src/commonMain/kotlin/com/ticketinglabs/client/
    core/        Outcome result type, AppError taxonomy, Recovery, UiState, Logger  [done]
    domain/model port usecase   validated models, ports, use cases                  [done]
    data/        Ktor adapter → gateway base URL, DTO → domain mapping, error map   [done]
  src/commonTest/kotlin/...     use-case, domain and data tests (MockEngine)         [done]

:composeApp                   Compose Multiplatform UI. Targets: desktop + android + ios. [done]
  src/commonMain/kotlin/com/ticketinglabs/client/
    presentation/ ViewModels + StateFlow (events, waiting, reservation, order)
    ui/           atoms → components → screens, theme (tokens), gallery, previews
    demo/         in-memory repositories for the runnable demo
  src/commonTest/   ViewModel tests (run on desktop via Dispatchers.setMain)
  src/desktopMain/  Main.kt (window entry hosting the flow + gallery)
  src/androidMain/  MainActivity (ComponentActivity → setContent { App() })
  src/iosMain/      MainViewController (ComposeUIViewController { App() })
```

Previews use the unified `@Preview` in `commonMain` (see `ui/Previews.kt`) and the runnable
`Gallery` renders every component across its states. See
[`docs/client-architecture.md`](../../docs/client-architecture.md).
