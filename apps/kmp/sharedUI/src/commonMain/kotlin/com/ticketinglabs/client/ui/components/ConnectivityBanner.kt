package com.ticketinglabs.client.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.ticketinglabs.client.presentation.Connectivity
import com.ticketinglabs.client.ui.theme.Tokens

/**
 * A slim status bar for server reachability. Shows nothing when ONLINE, a muted "checking"
 * line while probing, and an error line with a Retry when OFFLINE. It informs; it never
 * blocks the flow — the app is offline-first and stays usable regardless.
 */
@Composable
fun ConnectivityBanner(state: Connectivity, onRetry: () -> Unit) {
    when (state) {
        Connectivity.ONLINE -> Unit
        Connectivity.CHECKING -> Bar("Checking connection…", Tokens.surfaceAlt, Tokens.muted)
        Connectivity.OFFLINE -> Bar("Server unreachable — working offline", Tokens.err, Tokens.onAccent, onRetry)
    }
}

@Composable
private fun Bar(message: String, background: androidx.compose.ui.graphics.Color, content: androidx.compose.ui.graphics.Color, onRetry: (() -> Unit)? = null) {
    Row(
        modifier = Modifier.fillMaxWidth().background(background).padding(horizontal = Tokens.spaceLg, vertical = Tokens.spaceSm),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(message, color = content)
        if (onRetry != null) {
            TextButton(onClick = onRetry) { Text("Retry", color = content) }
        }
    }
}
