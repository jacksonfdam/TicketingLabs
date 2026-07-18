import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ticketing_client/core/core.dart';
import 'package:ticketing_client/domain/models.dart';
import 'package:ticketing_client/ui/screens.dart';
import 'package:ticketing_client/ui/theme.dart';

void main() {
  testWidgets('EventsScreen renders a spinner while loading and cards on success', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: ticketingTheme(),
      home: EventsScreen(state: const UiLoading(), onOpen: (_) {}, onRetry: () {}),
    ));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    final events = [
      Event(id: 'e1', name: 'Skyline Festival', venue: 'Riverside Park', startsAt: DateTime(2026), salesOpenAt: DateTime(2026), status: EventStatus.onSale),
    ];
    await tester.pumpWidget(MaterialApp(
      theme: ticketingTheme(),
      home: EventsScreen(state: UiSuccess(events), onOpen: (_) {}, onRetry: () {}),
    ));
    expect(find.text('Skyline Festival'), findsOneWidget);
    expect(find.text('On sale'), findsOneWidget);
  });

  testWidgets('an error state shows the shared copy and a retry action', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: ticketingTheme(),
      home: EventsScreen(state: const UiError(NetworkUnavailable()), onOpen: (_) {}, onRetry: () {}),
    ));
    expect(find.text('No connection'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });
}
