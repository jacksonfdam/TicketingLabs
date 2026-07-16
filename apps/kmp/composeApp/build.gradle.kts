import org.jetbrains.compose.desktop.application.dsl.TargetFormat

// The Compose Multiplatform UI. Built as a Desktop (JVM) application so the UI compiles and
// runs without an emulator, which is the verification target for this lab. The composables
// are platform-agnostic Material 3; Android and iOS entry points reuse them unchanged.
plugins {
    alias(libs.plugins.kotlinJvm)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
}

dependencies {
    implementation(project(":shared"))
    implementation(compose.desktop.currentOs) // pulls runtime, foundation and ui
    implementation(compose.material3)
    implementation(libs.kotlinx.coroutines.core)
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
