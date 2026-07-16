package com.ticketinglabs.client.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import com.ticketinglabs.client.ui.theme.Tokens

// Colour schemes derived from the shared design tokens (see ui/theme/Tokens). The dark
// scheme is the reference palette; the light scheme is a sensible inversion for the theme
// toggle the template's entry points expose.

private val DarkColors = darkColorScheme(
    primary = Tokens.accent,
    onPrimary = Tokens.onAccent,
    background = Tokens.bg,
    onBackground = Tokens.text,
    surface = Tokens.surface,
    onSurface = Tokens.text,
    surfaceVariant = Tokens.surfaceAlt,
    onSurfaceVariant = Tokens.muted,
    error = Tokens.err,
    onError = Color.White,
    outline = Tokens.line,
)

private val LightColors = lightColorScheme(
    primary = Tokens.accent,
    onPrimary = Color.White,
    background = Color(0xFFF7F8FA),
    onBackground = Color(0xFF12141A),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF12141A),
    surfaceVariant = Color(0xFFE9ECF1),
    onSurfaceVariant = Color(0xFF5A6270),
    error = Tokens.err,
    onError = Color.White,
    outline = Color(0xFFCBD2DC),
)

/** Exposes the current dark/light choice so the toggle button can flip it. */
val LocalThemeIsDark = compositionLocalOf { mutableStateOf(true) }

/**
 * The app theme. Defaults to the system setting and can be toggled at runtime; the
 * [onThemeChanged] callback lets each platform entry point sync the system bars. Modelled
 * on the official Compose Multiplatform template's `AppTheme`.
 */
@Composable
fun AppTheme(
    onThemeChanged: @Composable (isDark: Boolean) -> Unit = {},
    content: @Composable () -> Unit,
) {
    val systemIsDark = isSystemInDarkTheme()
    val isDarkState = remember(systemIsDark) { mutableStateOf(systemIsDark) }
    CompositionLocalProvider(LocalThemeIsDark provides isDarkState) {
        val isDark by isDarkState
        onThemeChanged(!isDark)
        MaterialTheme(
            colorScheme = if (isDark) DarkColors else LightColors,
            content = { Surface(content = content) },
        )
    }
}
