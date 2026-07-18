/// The preview catalog: every atom, molecule and organism across its states on one screen.
/// This is the deliverable preview surface — it runs wherever the app runs.
library;

import 'package:flutter/material.dart';

import '../core/core.dart';
import '../domain/models.dart';
import 'theme.dart';
import 'widgets.dart';

class GalleryScreen extends StatelessWidget {
  const GalleryScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Gallery')),
        body: ListView(
          padding: const EdgeInsets.all(Tokens.spaceXl),
          children: [
            _section('Buttons', [
              PrimaryButton('Enabled', onPressed: () {}),
              const PrimaryButton('Disabled'),
            ]),
            _section('Badges', const [
              StatusBadge('On sale', Tokens.ok),
              StatusBadge('Sold out', Tokens.err),
              StatusBadge("You're in", Tokens.accent),
            ]),
            _section('Countdown', const [
              CountdownText(90000),
              CountdownText(15000),
              CountdownText(0),
            ]),
            _section('SectorRow', [
              SectorRow(Sector(id: 's1', eventId: 'e1', name: 'Front stage', price: Money(9500, 'GBP'), totalInventory: 100, availableInventory: 12), onSelect: () {}),
              SectorRow(Sector(id: 's2', eventId: 'e1', name: 'Restricted', price: Money(2500, 'GBP'), totalInventory: 50, availableInventory: 0), onSelect: () {}),
            ]),
            _section('Error states (taxonomy)', [
              ErrorBanner(const NetworkUnavailable(requestId: 'req-1'), onAction: () {}),
              ErrorBanner(const Conflict(backendCode: 'inventory_exhausted', requestId: 'req-2'), onAction: () {}),
              ErrorBanner(const PaymentUnknown(requestId: 'req-3'), onAction: () {}),
            ]),
          ],
        ),
      );

  Widget _section(String title, List<Widget> children) => Padding(
        padding: const EdgeInsets.only(bottom: Tokens.spaceXl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(color: Tokens.muted, fontWeight: FontWeight.bold)),
            const SizedBox(height: Tokens.spaceSm),
            for (final c in children) Padding(padding: const EdgeInsets.only(bottom: Tokens.spaceSm), child: c),
            const Divider(color: Tokens.line),
          ],
        ),
      );
}
