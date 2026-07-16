package com.ticketinglabs.client.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ticketinglabs.client.core.AppError
import com.ticketinglabs.client.domain.model.Event
import com.ticketinglabs.client.domain.model.EventId
import com.ticketinglabs.client.domain.model.EventStatus
import com.ticketinglabs.client.domain.model.Money
import com.ticketinglabs.client.domain.model.Order
import com.ticketinglabs.client.domain.model.OrderId
import com.ticketinglabs.client.domain.model.OrderStatus
import com.ticketinglabs.client.domain.model.ReservationId
import com.ticketinglabs.client.domain.model.Sector
import com.ticketinglabs.client.domain.model.SectorId
import com.ticketinglabs.client.domain.model.Timestamp
import com.ticketinglabs.client.domain.model.UserId
import com.ticketinglabs.client.ui.atoms.CountdownTimer
import com.ticketinglabs.client.ui.atoms.PrimaryButton
import com.ticketinglabs.client.ui.atoms.StatusBadge
import com.ticketinglabs.client.ui.components.ErrorBanner
import com.ticketinglabs.client.ui.components.EventCard
import com.ticketinglabs.client.ui.components.OrderStatusPanel
import com.ticketinglabs.client.ui.components.SectorRow
import com.ticketinglabs.client.ui.theme.TicketingTheme
import com.ticketinglabs.client.ui.theme.Tokens
import org.jetbrains.compose.ui.tooling.preview.Preview

// Unified @Preview in commonMain: every atom, molecule and organism renders in isolation
// across its states, previewable in the IDE on any target. The on-device catalog is
// [Gallery]; these are the tooling-panel previews the spec asks for.

@Composable
private fun PreviewFrame(content: @Composable () -> Unit) {
    TicketingTheme {
        Surface {
            Column(Modifier.padding(Tokens.spaceLg), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                content()
            }
        }
    }
}

private val sampleEvent = Event(EventId("e1"), "Skyline Festival", "Riverside Park", Timestamp(0), Timestamp(0), EventStatus.ON_SALE)
private val sampleSector = Sector(SectorId("s1"), EventId("e1"), "Front stage", Money(9500, "GBP"), 100, 12)
private val soldOutSector = Sector(SectorId("s3"), EventId("e1"), "Restricted view", Money(2500, "GBP"), 50, 0)
private fun order(status: OrderStatus) = Order(OrderId("o1"), ReservationId("r1"), UserId("u1"), 9500, status, Timestamp(0))

@Preview
@Composable
fun ButtonsPreview() = PreviewFrame {
    PrimaryButton("Enabled", {})
    PrimaryButton("Disabled", {}, enabled = false)
}

@Preview
@Composable
fun BadgesPreview() = PreviewFrame {
    StatusBadge("On sale", Tokens.ok)
    StatusBadge("Sold out", Tokens.err)
    StatusBadge("You're in", Tokens.accent)
}

@Preview
@Composable
fun CountdownPreview() = PreviewFrame {
    CountdownTimer(90_000)
    CountdownTimer(15_000) // urgent (warn)
    CountdownTimer(0)
}

@Preview
@Composable
fun SectorRowPreview() = PreviewFrame {
    SectorRow(sampleSector) {}
    SectorRow(soldOutSector) {}
}

@Preview
@Composable
fun EventCardPreview() = PreviewFrame {
    EventCard(sampleEvent) {}
}

@Preview
@Composable
fun ErrorStatesPreview() = PreviewFrame {
    ErrorBanner(AppError.NetworkUnavailable(requestId = "req-1")) {}
    ErrorBanner(AppError.Conflict(backendCode = "inventory_exhausted", requestId = "req-2")) {}
    ErrorBanner(AppError.PaymentUnknown(requestId = "req-3")) {}
}

@Preview
@Composable
fun OrderStatusPreview() = PreviewFrame {
    OrderStatusPanel(order(OrderStatus.PAID)) {}
    OrderStatusPanel(order(OrderStatus.FAILED)) {}
    OrderStatusPanel(order(OrderStatus.PENDING)) {}
}
