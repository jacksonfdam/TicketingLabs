package com.ticketinglabs.client.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Design tokens, mirrored from `/shared/tokens/tokens.json`. Values are hardcoded here
 * rather than parsed at runtime because a desktop demo has no asset pipeline; the single
 * source of truth remains the JSON, and a codegen step would emit exactly this. The point
 * is that no composable types a raw hex code.
 */
object Tokens {
    val bg = Color(0xFF0F1115)
    val surface = Color(0xFF1A1E26)
    val surfaceAlt = Color(0xFF232834)
    val line = Color(0xFF2A2F3A)
    val text = Color(0xFFE6E8EC)
    val muted = Color(0xFF8B93A1)
    val accent = Color(0xFF4F8CFF)
    val onAccent = Color(0xFFFFFFFF)
    val ok = Color(0xFF3FB950)
    val warn = Color(0xFFF0883E)
    val err = Color(0xFFF85149)

    val spaceXs = 4.dp
    val spaceSm = 8.dp
    val spaceMd = 12.dp
    val spaceLg = 16.dp
    val spaceXl = 20.dp
    val spaceXxl = 24.dp

    val radiusSm = 8.dp
    val radiusMd = 12.dp
}

private val TicketingColorScheme = darkColorScheme(
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

/**
 * The app theme. Dark-only, matching the reference web app. Wraps Material 3 with the
 * token-derived colour scheme so every screen and component inherits consistent colour.
 */
@Composable
fun TicketingTheme(content: @Composable () -> Unit) {
    // isSystemInDarkTheme is read so the signature is honest about being theme-aware even
    // though only a dark scheme exists today; a light scheme would branch here.
    @Suppress("UNUSED_EXPRESSION") isSystemInDarkTheme()
    MaterialTheme(colorScheme = TicketingColorScheme, content = content)
}
