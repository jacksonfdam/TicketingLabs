import org.jetbrains.compose.desktop.application.dsl.TargetFormat

// The Compose Multiplatform UI module. The UI, state holders and previews live in
// commonMain and are shared verbatim across Android, iOS and Desktop; each platform only
// contributes a thin entry point (an Activity, a UIViewController, a main() + Window).
// Desktop is the target we run headlessly to verify the UI; the same composables back the
// Android (library) and iOS (framework) targets.
plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
}

kotlin {
    jvm("desktop")

    android {
        namespace = "com.ticketinglabs.client.app"
        compileSdk = libs.versions.androidCompileSdk.get().toInt()
        minSdk = libs.versions.androidMinSdk.get().toInt()
    }

    listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "ComposeApp"
            isStatic = true
        }
    }

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
        androidMain.dependencies {
            implementation(libs.androidx.activity.compose)
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
