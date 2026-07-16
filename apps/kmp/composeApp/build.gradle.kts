import org.jetbrains.compose.desktop.application.dsl.TargetFormat

// The Compose Multiplatform UI module. The UI, state holders and previews live in
// commonMain and are shared verbatim; each platform contributes only a thin entry point.
// This module targets Desktop, which is the target we run headlessly to verify the UI.
// The Android and iOS entry points reuse the same commonMain composables; they are added
// as targets once their thin entry wrappers (Activity, UIViewController) are in place.
plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
}

kotlin {
    jvm("desktop")

    sourceSets {
        commonMain.dependencies {
            implementation(project(":shared"))
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.ui)
            implementation(compose.components.uiToolingPreview)
            implementation(libs.androidx.lifecycle.viewmodel)
            implementation(libs.androidx.lifecycle.viewmodel.compose)
            implementation(libs.kotlinx.coroutines.core)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
        }
        val desktopMain by getting
        desktopMain.dependencies {
            implementation(compose.desktop.currentOs)
        }
    }
}

compose.desktop {
    application {
        mainClass = "com.ticketinglabs.client.MainKt"
        nativeDistributions {
            targetFormats(TargetFormat.Dmg)
            packageName = "TicketingLabs"
            packageVersion = "1.0.0"
        }
    }
}
