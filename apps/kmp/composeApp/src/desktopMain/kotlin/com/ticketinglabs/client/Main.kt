package com.ticketinglabs.client

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import com.ticketinglabs.client.ui.Gallery
import com.ticketinglabs.client.ui.theme.TicketingTheme
import com.ticketinglabs.client.ui.theme.Tokens

/**
 * Desktop (JVM) entry point. Hosts two tabs: the seven-screen flow ([App]) running against
 * the in-memory demo backend, and the component [Gallery]. Android and iOS have their own
 * thin entry points ([MainViewController], `MainActivity`) that call the same [App]; the UI
 * itself lives in commonMain and is shared verbatim.
 */
fun main() = application {
    Window(onCloseRequest = ::exitApplication, title = "Ticketing Labs — KMP (Desktop)") {
        TicketingTheme {
            Surface(Modifier.fillMaxSize()) {
                var tab by remember { mutableStateOf(0) }
                Column(Modifier.fillMaxSize()) {
                    TabRow(selectedTabIndex = tab) {
                        Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Flow") })
                        Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Gallery") })
                    }
                    Box(Modifier.fillMaxSize().padding(top = Tokens.spaceSm)) {
                        when (tab) {
                            0 -> App()
                            else -> Gallery()
                        }
                    }
                }
            }
        }
    }
}
