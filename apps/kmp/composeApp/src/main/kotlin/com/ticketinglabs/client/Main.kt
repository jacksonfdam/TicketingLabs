package com.ticketinglabs.client

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Surface
import androidx.compose.material3.TabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
 * Desktop entry point. Hosts two tabs: the seven-screen flow ([App]) running against the
 * in-memory demo backend, and the component [Gallery]. Android and iOS provide their own
 * thin entry points that call [App]; the UI itself is shared.
 */
fun main() = application {
    Window(onCloseRequest = ::exitApplication, title = "Ticketing Labs — KMP") {
        TicketingTheme {
            Surface(Modifier.fillMaxSize()) {
                var tab by remember { mutableStateOf(0) }
                Column(Modifier.fillMaxSize()) {
                    TabRow(selectedTabIndex = tab, modifier = Modifier.fillMaxWidth()) {
                        Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Flow") })
                        Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Gallery") })
                    }
                    Column(Modifier.fillMaxSize().padding(top = Tokens.spaceSm)) {
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
