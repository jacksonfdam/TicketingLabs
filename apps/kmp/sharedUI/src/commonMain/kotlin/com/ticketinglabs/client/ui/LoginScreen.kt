package com.ticketinglabs.client.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import com.ticketinglabs.client.core.UiState
import com.ticketinglabs.client.ui.atoms.MutedText
import com.ticketinglabs.client.ui.atoms.PrimaryButton
import com.ticketinglabs.client.ui.atoms.ScreenTitle
import com.ticketinglabs.client.ui.components.ErrorBanner
import com.ticketinglabs.client.ui.theme.Tokens

/**
 * Sign-in screen, shown only when the app runs against the real backend and has no token.
 * A pure function of a [UiState] login result: it renders loading, a typed error, and the
 * form; the caller owns the credentials and the `SessionManager.login` call.
 */
@Composable
fun LoginScreen(state: UiState<Unit>, onSubmit: (email: String, password: String) -> Unit) {
    var email by remember { mutableStateOf("buyer@ticketing.local") }
    var password by remember { mutableStateOf("password123") }
    val loading = state is UiState.Loading

    Column(
        Modifier.fillMaxSize().padding(Tokens.spaceXl),
        verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd),
    ) {
        ScreenTitle("Sign in")
        MutedText("Use the seeded demo credentials, or your own.")
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        when (state) {
            is UiState.Error -> ErrorBanner(state.error)
            is UiState.TimedOut -> ErrorBanner(state.error)
            else -> Unit
        }
        PrimaryButton(if (loading) "Signing in…" else "Sign in", { onSubmit(email.trim(), password) }, enabled = !loading)
    }
}
