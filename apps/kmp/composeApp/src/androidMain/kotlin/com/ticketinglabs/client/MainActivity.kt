package com.ticketinglabs.client

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent

/**
 * Android entry point. A host app registers this Activity; it does nothing but hand the
 * screen to the shared [App] composable. All UI and state live in commonMain.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { App() }
    }
}
