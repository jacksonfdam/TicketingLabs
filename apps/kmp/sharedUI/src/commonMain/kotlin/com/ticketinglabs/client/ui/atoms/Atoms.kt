package com.ticketinglabs.client.ui.atoms

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ticketinglabs.client.ui.theme.Tokens

/**
 * Atoms: the smallest UI building blocks. They hold no business logic — state flows in via
 * parameters, events flow out via callbacks. Each is exercised in the Gallery across states.
 */

/** Primary call to action. Disabled state is visually distinct and non-interactive. */
@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(onClick = onClick, enabled = enabled, modifier = modifier) { Text(text) }
}

/** Secondary, lower-emphasis action. */
@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = modifier) { Text(text) }
}

/** A pill badge whose colour conveys status (on sale, sold out, admitted, …). */
@Composable
fun StatusBadge(text: String, color: Color) {
    Surface(color = color.copy(alpha = 0.15f), shape = RoundedCornerShape(999.dp)) {
        Text(
            text = text,
            color = color,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = Tokens.spaceSm, vertical = Tokens.spaceXs),
        )
    }
}

/** Indeterminate loading spinner. */
@Composable
fun LoadingSpinner(modifier: Modifier = Modifier) {
    Box(modifier) { CircularProgressIndicator(strokeWidth = 2.dp) }
}

/** Screen title text. */
@Composable
fun ScreenTitle(text: String) {
    Text(text, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
}

/** Secondary, de-emphasised body text. */
@Composable
fun MutedText(text: String) {
    Text(text, color = Tokens.muted, style = MaterialTheme.typography.bodyMedium)
}

/**
 * A monospaced-feel countdown, mm:ss, that turns warn-coloured under 30s. Stateless: the
 * caller supplies the remaining time; the ticking clock is the caller's concern.
 *
 * @param remainingMs milliseconds left; clamped at zero.
 */
@Composable
fun CountdownTimer(remainingMs: Long) {
    val clamped = if (remainingMs < 0) 0 else remainingMs
    val totalSeconds = clamped / 1000
    val mm = totalSeconds / 60
    val ss = totalSeconds % 60
    val urgent = clamped <= 30_000
    Text(
        text = "${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}",
        color = if (urgent) Tokens.warn else Tokens.text,
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
    )
}
