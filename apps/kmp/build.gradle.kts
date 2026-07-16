// Root build script. Plugins are declared here (apply false) and applied per module, the
// conventional Kotlin Multiplatform layout. Versions come from gradle/libs.versions.toml.
plugins {
    alias(libs.plugins.kotlinMultiplatform) apply false
    alias(libs.plugins.kotlinSerialization) apply false
    alias(libs.plugins.androidLibrary) apply false
    alias(libs.plugins.composeMultiplatform) apply false
    alias(libs.plugins.composeCompiler) apply false
}
