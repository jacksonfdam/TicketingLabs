/// The seven flow screens. Stateless where possible: they take a [UiState] and callbacks
/// and render via [UiStateView].
library;

import 'package:flutter/material.dart';

import '../core/core.dart';
import '../domain/models.dart';
import 'theme.dart';
import 'widgets.dart';

Widget _scaffold(String title, Widget body) => Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SingleChildScrollView(padding: const EdgeInsets.all(Tokens.spaceXl), child: body),
    );

/// 1. Events list.
class EventsScreen extends StatelessWidget {
  final UiState<List<Event>> state;
  final void Function(Event) onOpen;
  final VoidCallback onRetry;
  const EventsScreen({required this.state, required this.onOpen, required this.onRetry, super.key});
  @override
  Widget build(BuildContext context) => _scaffold(
        'Events',
        UiStateView<List<Event>>(
          state,
          onRetry: onRetry,
          emptyText: 'No events on sale.',
          onSuccess: (events) => Column(
            children: [
              for (final e in events) ...[EventCard(e, onOpen: () => onOpen(e)), const SizedBox(height: Tokens.spaceMd)],
            ],
          ),
        ),
      );
}

/// 2. Event detail.
class EventDetailScreen extends StatelessWidget {
  final UiState<EventDetail> state;
  final VoidCallback onJoinQueue;
  final VoidCallback onRetry;
  const EventDetailScreen({required this.state, required this.onJoinQueue, required this.onRetry, super.key});
  @override
  Widget build(BuildContext context) => _scaffold(
        'Event',
        UiStateView<EventDetail>(
          state,
          onRetry: onRetry,
          onSuccess: (detail) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(detail.event.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
              MutedText(detail.event.venue),
              const SizedBox(height: Tokens.spaceMd),
              for (final s in detail.sectors)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: Tokens.spaceXs),
                  child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Text(s.name),
                    PriceTag(s.price.amountCents, s.price.currency),
                  ]),
                ),
              const SizedBox(height: Tokens.spaceLg),
              PrimaryButton('Join the queue', onPressed: onJoinQueue),
            ],
          ),
        ),
      );
}

/// 3. Waiting room.
class WaitingRoomScreen extends StatelessWidget {
  final UiState<QueueToken> state;
  final VoidCallback onContinue;
  final VoidCallback onRetry;
  const WaitingRoomScreen({required this.state, required this.onContinue, required this.onRetry, super.key});
  @override
  Widget build(BuildContext context) => _scaffold(
        'Waiting room',
        UiStateView<QueueToken>(
          state,
          onRetry: onRetry,
          onSuccess: (token) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              QueuePositionCard(token),
              if (token.isAdmitted) ...[
                const SizedBox(height: Tokens.spaceLg),
                PrimaryButton('Choose seats', onPressed: onContinue),
              ],
            ],
          ),
        ),
      );
}

/// 4. Sector selection with a per-sector quantity stepper; the CTA disables when sold out.
class SectorSelectionScreen extends StatelessWidget {
  final EventDetail detail;
  final void Function(Sector sector, int quantity) onReserve;
  const SectorSelectionScreen({required this.detail, required this.onReserve, super.key});
  @override
  Widget build(BuildContext context) => _scaffold(
        'Choose a sector',
        Column(children: [for (final s in detail.sectors) _SectorPicker(s, onReserve)]),
      );
}

class _SectorPicker extends StatefulWidget {
  final Sector sector;
  final void Function(Sector, int) onReserve;
  const _SectorPicker(this.sector, this.onReserve);
  @override
  State<_SectorPicker> createState() => _SectorPickerState();
}

class _SectorPickerState extends State<_SectorPicker> {
  int quantity = 1;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: Tokens.spaceMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectorRow(widget.sector, onSelect: () => widget.onReserve(widget.sector, quantity)),
            if (!widget.sector.isSoldOut)
              Row(children: [
                SecondaryButton('-', onPressed: () => setState(() => quantity = quantity > 1 ? quantity - 1 : 1)),
                Padding(padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd), child: Text('$quantity')),
                SecondaryButton('+', onPressed: () => setState(() => quantity = quantity < 8 ? quantity + 1 : 8)),
              ]),
          ],
        ),
      );
}

/// 5. Reservation with a live expiry countdown.
class ReservationScreen extends StatelessWidget {
  final UiState<Reservation> state;
  final int remainingMs;
  final VoidCallback onCheckout;
  final VoidCallback onRetry;
  const ReservationScreen(
      {required this.state, required this.remainingMs, required this.onCheckout, required this.onRetry, super.key});
  @override
  Widget build(BuildContext context) => _scaffold(
        'Your hold',
        UiStateView<Reservation>(
          state,
          onRetry: onRetry,
          onSuccess: (reservation) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${reservation.quantity} seat(s) held'),
              const SizedBox(height: Tokens.spaceSm),
              const MutedText('Complete checkout before the hold expires:'),
              const SizedBox(height: Tokens.spaceSm),
              CountdownText(remainingMs),
              const SizedBox(height: Tokens.spaceLg),
              PrimaryButton('Checkout', onPressed: (reservation.isHeld && remainingMs > 0) ? onCheckout : null),
            ],
          ),
        ),
      );
}

/// 6 + 7. Order status, polled live.
class OrderStatusScreen extends StatelessWidget {
  final UiState<Order> state;
  final VoidCallback onDone;
  final VoidCallback onRetry;
  const OrderStatusScreen({required this.state, required this.onDone, required this.onRetry, super.key});
  @override
  Widget build(BuildContext context) => _scaffold(
        'Order',
        UiStateView<Order>(
          state,
          onRetry: onRetry,
          onSuccess: (order) => OrderStatusPanel(order, onDone: onDone),
        ),
      );
}
