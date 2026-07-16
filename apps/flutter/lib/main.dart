/// Entry point. Hosts the seven-screen flow (against the in-memory demo backend) and the
/// component gallery behind a bottom navigation bar.
library;

import 'package:flutter/material.dart';

import 'app.dart';
import 'ui/gallery.dart';
import 'ui/theme.dart';

void main() => runApp(const TicketingApp());

class TicketingApp extends StatelessWidget {
  const TicketingApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Ticketing Labs',
        theme: ticketingTheme(),
        debugShowCheckedModeBanner: false,
        home: const _Home(),
      );
}

class _Home extends StatefulWidget {
  const _Home();
  @override
  State<_Home> createState() => _HomeState();
}

class _HomeState extends State<_Home> {
  int _tab = 0;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: IndexedStack(
          index: _tab,
          children: const [FlowApp(), GalleryScreen()],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.confirmation_number_outlined), label: 'Flow'),
            NavigationDestination(icon: Icon(Icons.grid_view_outlined), label: 'Gallery'),
          ],
        ),
      );
}
