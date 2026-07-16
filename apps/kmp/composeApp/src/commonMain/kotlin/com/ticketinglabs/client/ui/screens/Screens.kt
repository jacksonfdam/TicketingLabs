package com.ticketinglabs.client.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import com.ticketinglabs.client.core.UiState
import com.ticketinglabs.client.domain.model.Event
import com.ticketinglabs.client.domain.model.EventDetail
import com.ticketinglabs.client.domain.model.Order
import com.ticketinglabs.client.domain.model.QueueToken
import com.ticketinglabs.client.domain.model.Reservation
import com.ticketinglabs.client.domain.model.Sector
import com.ticketinglabs.client.ui.atoms.CountdownTimer
import com.ticketinglabs.client.ui.atoms.MutedText
import com.ticketinglabs.client.ui.atoms.PrimaryButton
import com.ticketinglabs.client.ui.atoms.ScreenTitle
import com.ticketinglabs.client.ui.atoms.SecondaryButton
import com.ticketinglabs.client.ui.components.EventCard
import com.ticketinglabs.client.ui.components.OrderStatusPanel
import com.ticketinglabs.client.ui.components.PriceTag
import com.ticketinglabs.client.ui.components.QueuePositionCard
import com.ticketinglabs.client.ui.components.SectorRow
import com.ticketinglabs.client.ui.components.UiStateContent
import com.ticketinglabs.client.ui.theme.Tokens

/** A screen scaffold: title header over a scrollable, padded content column. */
@Composable
fun ScreenScaffold(title: String, content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Tokens.spaceXl),
        verticalArrangement = Arrangement.spacedBy(Tokens.spaceLg),
    ) {
        ScreenTitle(title)
        content()
    }
}

/** 1. Events list. */
@Composable
fun EventsScreen(state: UiState<List<Event>>, onOpen: (Event) -> Unit, onRetry: () -> Unit) {
    ScreenScaffold("Events") {
        UiStateContent(state, onRetry = onRetry, emptyText = "No events on sale.") { events ->
            Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
                events.forEach { EventCard(it, onOpen) }
            }
        }
    }
}

/** 2. Event detail. */
@Composable
fun EventDetailScreen(state: UiState<EventDetail>, onJoinQueue: () -> Unit, onRetry: () -> Unit) {
    ScreenScaffold("Event") {
        UiStateContent(state, onRetry = onRetry) { detail ->
            Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
                Text(detail.event.name, fontWeight = FontWeight.Bold)
                MutedText(detail.event.venue)
                detail.sectors.forEach { s ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(s.name)
                        PriceTag(s.price.amountCents, s.price.currency)
                    }
                }
                PrimaryButton("Join the queue", onJoinQueue)
            }
        }
    }
}

/** 3. Waiting room. */
@Composable
fun WaitingRoomScreen(state: UiState<QueueToken>, onContinue: () -> Unit, onRetry: () -> Unit) {
    ScreenScaffold("Waiting room") {
        UiStateContent(state, onRetry = onRetry) { token ->
            Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceLg)) {
                QueuePositionCard(token)
                if (token.isAdmitted) PrimaryButton("Choose seats", onContinue)
            }
        }
    }
}

/** 4. Sector selection with a quantity stepper; the CTA disables when sold out. */
@Composable
fun SectorSelectionScreen(detail: EventDetail, onReserve: (Sector, Int) -> Unit) {
    ScreenScaffold("Choose a sector") {
        Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
            detail.sectors.forEach { sector ->
                var quantity by remember(sector.id.value) { mutableStateOf(1) }
                Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    SectorRow(sector) { onReserve(sector, quantity) }
                    if (!sector.isSoldOut) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
                            SecondaryButton("-", { if (quantity > 1) quantity-- })
                            Text("$quantity")
                            SecondaryButton("+", { if (quantity < 8) quantity++ })
                        }
                    }
                }
            }
        }
    }
}

/** 5. Reservation with a live expiry countdown; the CTA is disabled while not held. */
@Composable
fun ReservationScreen(
    state: UiState<Reservation>,
    remainingMs: Long,
    onCheckout: () -> Unit,
    onRetry: () -> Unit,
) {
    ScreenScaffold("Your hold") {
        UiStateContent(state, onRetry = onRetry) { reservation ->
            Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceLg)) {
                Text("${reservation.quantity} seat(s) held")
                MutedText("Complete checkout before the hold expires:")
                CountdownTimer(remainingMs)
                PrimaryButton("Checkout", onCheckout, enabled = reservation.isHeld && remainingMs > 0)
            }
        }
    }
}

/** 6 + 7. Checkout kicks off the order; this screen shows its live, polled status. */
@Composable
fun OrderStatusScreen(state: UiState<Order>, onDone: () -> Unit, onRetry: () -> Unit) {
    ScreenScaffold("Order") {
        UiStateContent(state, onRetry = onRetry) { order ->
            OrderStatusPanel(order, onDone)
        }
    }
}
