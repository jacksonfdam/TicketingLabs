// Root build script. Plugins are declared here (apply false) and applied per module, the
// layout of the official Compose Multiplatform template. Versions come from
// gradle/libs.versions.toml.
plugins {
    alias(libs.plugins.kotlin.multiplatform).apply(false)
    alias(libs.plugins.compose.compiler).apply(false)
    alias(libs.plugins.compose.multiplatform).apply(false)
    alias(libs.plugins.android.application).apply(false)
    alias(libs.plugins.android.kmp.library).apply(false)
    alias(libs.plugins.kotlinx.serialization).apply(false)
}
