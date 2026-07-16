package com.ticketinglabs.client.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.UiState
import com.ticketinglabs.client.domain.model.Event
import com.ticketinglabs.client.domain.model.EventId
import com.ticketinglabs.client.domain.model.EventStatus
import com.ticketinglabs.client.domain.model.Money
import com.ticketinglabs.client.domain.model.Sector
import com.ticketinglabs.client.domain.model.SectorId
import com.ticketinglabs.client.domain.model.Timestamp
import com.ticketinglabs.client.ui.atoms.CountdownTimer
import com.ticketinglabs.client.ui.atoms.LoadingSpinner
import com.ticketinglabs.client.ui.atoms.PrimaryButton
import com.ticketinglabs.client.ui.atoms.StatusBadge
import com.ticketinglabs.client.ui.components.ErrorBanner
import com.ticketinglabs.client.ui.components.SectorRow
import com.ticketinglabs.client.ui.components.UiStateContent
import com.ticketinglabs.client.ui.theme.Tokens

/**
 * The preview catalog: every atom, molecule and organism rendered across its states in one
 * scrollable screen. This is the deliverable "preview" surface — it runs on device (or here,
 * on desktop) rather than only in an IDE, so the component states are demonstrable anywhere
 * the app runs. Android's `@Preview` annotations layer on top of these same composables.
 */
@Composable
fun Gallery() {
    Column(
        Modifier.verticalScroll(rememberScrollState()).padding(Tokens.spaceXl),
        verticalArrangement = Arrangement.spacedBy(Tokens.spaceLg),
    ) {
        section("Buttons") {
            PrimaryButton("Enabled", {})
            PrimaryButton("Disabled", {}, enabled = false)
        }
        section("Badges") {
            StatusBadge("On sale", Tokens.ok)
            StatusBadge("Sold out", Tokens.err)
            StatusBadge("You're in", Tokens.accent)
        }
        section("Countdown") {
            CountdownTimer(90_000)
            CountdownTimer(15_000) // urgent (warn)
            CountdownTimer(0)
        }
        section("Spinner") { LoadingSpinner() }
        section("SectorRow (available / sold out)") {
            SectorRow(Sector(SectorId("s1"), EventId("e1"), "Front stage", Money(9500, "GBP"), 100, 12)) {}
            SectorRow(Sector(SectorId("s2"), EventId("e1"), "Restricted", Money(2500, "GBP"), 50, 0)) {}
        }
        section("Error states (taxonomy)") {
            ErrorBanner(AppError.NetworkUnavailable(requestId = "req-1")) {}
            ErrorBanner(AppError.Conflict(backendCode = "inventory_exhausted", requestId = "req-2")) {}
            ErrorBanner(AppError.PaymentUnknown(requestId = "req-3")) {}
        }
        section("UiState renderer") {
            UiStateContent<Unit>(UiState.Loading) {}
            UiStateContent<Unit>(UiState.Empty) {}
            UiStateContent(
                UiState.Success(Event(EventId("e1"), "Demo", "Venue", Timestamp(0), Timestamp(0), EventStatus.ON_SALE)),
            ) { Text("Success: ${it.name}") }
        }
    }
}

@Composable
private fun section(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
        Text(title, fontWeight = FontWeight.Bold, color = Tokens.muted)
        content()
        HorizontalDivider(Modifier.padding(top = Tokens.spaceSm), color = Tokens.line)
    }
}
