/// The design system: atoms, molecules, organisms, and the generic UI-state renderer.
/// State flows in via constructor params, events out via callbacks. Every piece appears in
/// the Gallery across its states.
library;

import 'package:flutter/material.dart';

import '../core/core.dart';
import '../domain/models.dart';
import 'copy.dart';
import 'theme.dart';

String formatMoney(int amountCents, String currency) {
  final major = amountCents ~/ 100;
  final minor = (amountCents % 100).toString().padLeft(2, '0');
  return '$major.$minor $currency';
}

// --- Atoms ---

class PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  const PrimaryButton(this.label, {this.onPressed, super.key});
  @override
  Widget build(BuildContext context) => FilledButton(onPressed: onPressed, child: Text(label));
}

class SecondaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  const SecondaryButton(this.label, {this.onPressed, super.key});
  @override
  Widget build(BuildContext context) => OutlinedButton(onPressed: onPressed, child: Text(label));
}

class StatusBadge extends StatelessWidget {
  final String label;
  final Color color;
  const StatusBadge(this.label, this.color, {super.key});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceSm, vertical: Tokens.spaceXs),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
      );
}

class MutedText extends StatelessWidget {
  final String text;
  const MutedText(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Text(text, style: const TextStyle(color: Tokens.muted));
}

/// mm:ss countdown that turns warn-coloured under 30s. Stateless; the caller ticks the clock.
class CountdownText extends StatelessWidget {
  final int remainingMs;
  const CountdownText(this.remainingMs, {super.key});
  @override
  Widget build(BuildContext context) {
    final clamped = remainingMs < 0 ? 0 : remainingMs;
    final totalSeconds = clamped ~/ 1000;
    final mm = (totalSeconds ~/ 60).toString().padLeft(2, '0');
    final ss = (totalSeconds % 60).toString().padLeft(2, '0');
    final urgent = clamped <= 30000;
    return Text('$mm:$ss',
        style: TextStyle(
          color: urgent ? Tokens.warn : Tokens.text,
          fontSize: 28,
          fontWeight: FontWeight.bold,
          fontFeatures: const [FontFeature.tabularFigures()],
        ));
  }
}

// --- Molecules / organisms ---

class ErrorBanner extends StatelessWidget {
  final AppError error;
  final VoidCallback? onAction;
  const ErrorBanner(this.error, {this.onAction, super.key});
  @override
  Widget build(BuildContext context) {
    final copy = copyFor(error);
    return Card(
      color: Tokens.surfaceAlt,
      child: Padding(
        padding: const EdgeInsets.all(Tokens.spaceLg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(copy.title, style: const TextStyle(color: Tokens.err, fontWeight: FontWeight.bold)),
            const SizedBox(height: Tokens.spaceSm),
            MutedText(copy.message),
            if (error.requestId != null) ...[
              const SizedBox(height: Tokens.spaceXs),
              MutedText('Ref: ${error.requestId}'),
            ],
            if (copy.actionLabel != null && onAction != null) ...[
              const SizedBox(height: Tokens.spaceMd),
              PrimaryButton(copy.actionLabel!, onPressed: onAction),
            ],
          ],
        ),
      ),
    );
  }
}

class PriceTag extends StatelessWidget {
  final int amountCents;
  final String currency;
  const PriceTag(this.amountCents, this.currency, {super.key});
  @override
  Widget build(BuildContext context) =>
      Text(formatMoney(amountCents, currency), style: const TextStyle(fontWeight: FontWeight.bold));
}

class SectorRow extends StatelessWidget {
  final Sector sector;
  final VoidCallback onSelect;
  const SectorRow(this.sector, {required this.onSelect, super.key});
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(Tokens.spaceLg),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(sector.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: Tokens.spaceXs),
                  sector.isSoldOut
                      ? const StatusBadge('Sold out', Tokens.err)
                      : MutedText('${sector.availableInventory} left'),
                ],
              ),
              Row(children: [
                PriceTag(sector.price.amountCents, sector.price.currency),
                const SizedBox(width: Tokens.spaceLg),
                PrimaryButton('Select', onPressed: sector.isSoldOut ? null : onSelect),
              ]),
            ],
          ),
        ),
      );
}

class QueuePositionCard extends StatelessWidget {
  final QueueToken token;
  const QueuePositionCard(this.token, {super.key});
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(Tokens.spaceXl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: token.isAdmitted
                ? const [StatusBadge("You're in", Tokens.ok), SizedBox(height: Tokens.spaceSm), MutedText('You have been admitted. Pick your seats.')]
                : [
                    Text('Position ${token.position}', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                    const SizedBox(height: Tokens.spaceSm),
                    const MutedText("Hold tight. We'll let you in shortly."),
                  ],
          ),
        ),
      );
}

class EventCard extends StatelessWidget {
  final Event event;
  final VoidCallback onOpen;
  const EventCard(this.event, {required this.onOpen, super.key});
  @override
  Widget build(BuildContext context) {
    final badge = switch (event.status) {
      EventStatus.onSale => const StatusBadge('On sale', Tokens.ok),
      EventStatus.soldOut => const StatusBadge('Sold out', Tokens.err),
      EventStatus.draft => const StatusBadge('Draft', Tokens.muted),
      EventStatus.closed => const StatusBadge('Closed', Tokens.muted),
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Tokens.spaceLg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(event.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: Tokens.spaceXs),
            MutedText(event.venue),
            const SizedBox(height: Tokens.spaceSm),
            badge,
            const SizedBox(height: Tokens.spaceSm),
            SecondaryButton('View', onPressed: onOpen),
          ],
        ),
      ),
    );
  }
}

class OrderStatusPanel extends StatelessWidget {
  final Order order;
  final VoidCallback onDone;
  const OrderStatusPanel(this.order, {required this.onDone, super.key});
  @override
  Widget build(BuildContext context) {
    final (label, color, message) = switch (order.status) {
      OrderStatus.pending => ('Pending', Tokens.warn, 'Payment is processing. This can take a moment.'),
      OrderStatus.paid => ('Paid', Tokens.ok, "You're all set. Your tickets are confirmed."),
      OrderStatus.failed => ('Failed', Tokens.err, 'Payment failed. You can try ordering again.'),
      OrderStatus.refunded => ('Refunded', Tokens.muted, 'This order was refunded.'),
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Tokens.spaceXl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            StatusBadge(label, color),
            const SizedBox(height: Tokens.spaceMd),
            Text(formatMoney(order.amountCents, 'GBP'), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: Tokens.spaceSm),
            MutedText(message),
            if (order.status != OrderStatus.pending) ...[
              const SizedBox(height: Tokens.spaceMd),
              PrimaryButton('Done', onPressed: onDone),
            ],
          ],
        ),
      ),
    );
  }
}

/// Generic renderer for a [UiState]. Loading/empty/error/timeout are drawn consistently;
/// the caller supplies only the success builder.
class UiStateView<T> extends StatelessWidget {
  final UiState<T> state;
  final VoidCallback? onRetry;
  final String emptyText;
  final Widget Function(T data) onSuccess;
  const UiStateView(this.state, {required this.onSuccess, this.onRetry, this.emptyText = 'Nothing here yet.', super.key});

  @override
  Widget build(BuildContext context) => switch (state) {
        UiIdle() || UiLoading() || UiRetrying() => const Center(child: CircularProgressIndicator()),
        UiEmpty() => MutedText(emptyText),
        UiError(error: final e) => ErrorBanner(e, onAction: onRetry),
        UiTimedOut(error: final e) => ErrorBanner(e, onAction: onRetry),
        UiSuccess(data: final d) => onSuccess(d),
      };
}
