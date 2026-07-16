// The :shared module holds the framework-free core, domain, data and presentation layers.
// It is deliberately UI-free — no Compose here — so the business logic can be unit-tested on
// the JVM in milliseconds. Compose UI lives in a separate module added later.
//
// AGP 9 dropped 'com.android.library' compatibility with Kotlin Multiplatform, so the
// Android target is declared with the newer 'com.android.kotlin.multiplatform.library'
// plugin via the kotlin { androidLibrary { } } DSL.
plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.androidLibrary)
}

kotlin {
    jvm()

    android {
        namespace = "com.ticketinglabs.client.shared"
        compileSdk = libs.versions.androidCompileSdk.get().toInt()
        minSdk = libs.versions.androidMinSdk.get().toInt()
        withHostTest {} // run commonTest on the Android (JVM host) target too
    }

    listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.ktor.client.core)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.ktor.client.mock)
        }
    }
}
