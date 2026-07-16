package com.ticketinglabs.client

import androidx.compose.ui.window.ComposeUIViewController
import platform.UIKit.UIViewController

/**
 * iOS entry point. The Swift side calls this factory to obtain a UIViewController hosting
 * the shared [App] composable. All UI and state live in commonMain.
 */
fun MainViewController(): UIViewController = ComposeUIViewController { App() }
