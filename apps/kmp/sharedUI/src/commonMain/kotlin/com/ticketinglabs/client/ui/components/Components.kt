package com.ticketinglabs.client.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.core.UiState
import com.ticketinglabs.client.domain.model.Event
import com.ticketinglabs.client.domain.model.EventStatus
import com.ticketinglabs.client.domain.model.Order
import com.ticketinglabs.client.domain.model.OrderStatus
import com.ticketinglabs.client.domain.model.QueueToken
import com.ticketinglabs.client.domain.model.Sector
import com.ticketinglabs.client.ui.Copy
import com.ticketinglabs.client.ui.atoms.CountdownTimer
import com.ticketinglabs.client.ui.atoms.LoadingSpinner
import com.ticketinglabs.client.ui.atoms.MutedText
import com.ticketinglabs.client.ui.atoms.PrimaryButton
import com.ticketinglabs.client.ui.atoms.ScreenTitle
import com.ticketinglabs.client.ui.atoms.SecondaryButton
import com.ticketinglabs.client.ui.atoms.StatusBadge
import com.ticketinglabs.client.ui.theme.Tokens

/** Formats minor units + ISO currency as a simple, unambiguous price string. */
fun formatMoney(amountCents: Int, currency: String): String {
    val major = amountCents / 100
    val minor = (amountCents % 100).toString().padStart(2, '0')
    return "$major.$minor $currency"
}

/** Maps an event's sale status to its badge label and colour. */
@Composable
private fun eventStatusBadge(status: EventStatus) = when (status) {
    EventStatus.ON_SALE -> StatusBadge("On sale", Tokens.ok)
    EventStatus.SOLD_OUT -> StatusBadge("Sold out", Tokens.err)
    EventStatus.DRAFT -> StatusBadge("Draft", Tokens.muted)
    EventStatus.CLOSED -> StatusBadge("Closed", Tokens.muted)
}

// --- Molecules ---

/** Shows a typed error using the shared copy: title, message, and a recovery action. */
@Composable
fun ErrorBanner(error: AppError, onAction: (() -> Unit)? = null) {
    val copy = Copy.of(error)
    Card(colors = CardDefaults.cardColors(containerColor = Tokens.surfaceAlt)) {
        Column(Modifier.padding(Tokens.spaceLg), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
            Text(copy.title, fontWeight = FontWeight.Bold, color = Tokens.err)
            MutedText(copy.message)
            error.requestId?.let { MutedText("Ref: $it") }
            if (copy.actionLabel != null && onAction != null) {
                PrimaryButton(copy.actionLabel, onAction)
            }
        }
    }
}

/** A price with an optional per-quantity multiplier. */
@Composable
fun PriceTag(amountCents: Int, currency: String) {
    Text(formatMoney(amountCents, currency), fontWeight = FontWeight.Bold)
}

/** A selectable sector row; disabled and dimmed when sold out. */
@Composable
fun SectorRow(sector: Sector, onSelect: (Sector) -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Tokens.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(Tokens.spaceLg),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
                Text(sector.name, fontWeight = FontWeight.Bold)
                if (sector.isSoldOut) StatusBadge("Sold out", Tokens.err)
                else MutedText("${sector.availableInventory} left")
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceLg), verticalAlignment = Alignment.CenterVertically) {
                PriceTag(sector.price.amountCents, sector.price.currency)
                PrimaryButton("Select", { onSelect(sector) }, enabled = !sector.isSoldOut)
            }
        }
    }
}

/** The waiting-room position card. */
@Composable
fun QueuePositionCard(token: QueueToken) {
    Card(colors = CardDefaults.cardColors(containerColor = Tokens.surface), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(Tokens.spaceXl), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
            if (token.isAdmitted) {
                StatusBadge("You're in", Tokens.ok)
                MutedText("You have been admitted. Pick your seats.")
            } else {
                Text("Position ${token.position}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                MutedText("Hold tight. We'll let you in shortly.")
            }
        }
    }
}

// --- Organisms ---

/** A tappable event summary card. */
@Composable
fun EventCard(event: Event, onOpen: (Event) -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Tokens.surface),
        shape = RoundedCornerShape(Tokens.radiusMd),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.fillMaxWidth().padding(Tokens.spaceLg), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
            Text(event.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            MutedText(event.venue)
            eventStatusBadge(event.status)
            SecondaryButton("View", { onOpen(event) })
        }
    }
}

/** The order status panel: amount plus a colour-coded, per-state message and action. */
@Composable
fun OrderStatusPanel(order: Order, onDone: () -> Unit) {
    val (label, color, message) = when (order.status) {
        OrderStatus.PENDING -> Triple("Pending", Tokens.warn, "Payment is processing. This can take a moment.")
        OrderStatus.PAID -> Triple("Paid", Tokens.ok, "You're all set. Your tickets are confirmed.")
        OrderStatus.FAILED -> Triple("Failed", Tokens.err, "Payment failed. You can try ordering again.")
        OrderStatus.REFUNDED -> Triple("Refunded", Tokens.muted, "This order was refunded.")
    }
    Card(colors = CardDefaults.cardColors(containerColor = Tokens.surface), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(Tokens.spaceXl), verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
            StatusBadge(label, color)
            Text(formatMoney(order.amountCents, "GBP"), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            MutedText(message)
            if (order.status != OrderStatus.PENDING) PrimaryButton("Done", onDone)
        }
    }
}

/**
 * Generic renderer for a [UiState]. The screen passes the state and how to draw success;
 * every other case (loading, empty, error, timeout, retrying) is drawn consistently here,
 * so no screen reinvents a spinner or an error layout.
 */
@Composable
fun <T> UiStateContent(
    state: UiState<T>,
    onRetry: (() -> Unit)? = null,
    emptyText: String = "Nothing here yet.",
    success: @Composable (T) -> Unit,
) {
    when (state) {
        is UiState.Idle, is UiState.Loading, is UiState.Retrying -> LoadingSpinner()
        is UiState.Empty -> MutedText(emptyText)
        is UiState.Error -> ErrorBanner(state.error, onRetry)
        is UiState.TimedOut -> ErrorBanner(state.error, onRetry)
        is UiState.Success -> success(state.data)
    }
}
