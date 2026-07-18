/// Entry point. Hosts the seven-screen flow (against the in-memory demo backend) and the
/// component gallery behind a bottom navigation bar, under an app-wide connectivity banner.
library;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'app.dart';
import 'config/app_config.dart';
import 'data/reachability.dart';
import 'presentation/connectivity_cubit.dart';
import 'ui/connectivity_banner.dart';
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
  late final ConnectivityCubit _connectivity =
      ConnectivityCubit(DioReachabilityChecker(AppConfig.baseUrl, timeout: AppConfig.reachabilityTimeout));

  @override
  void dispose() {
    _connectivity.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(
          children: [
            SafeArea(
              bottom: false,
              child: BlocBuilder<ConnectivityCubit, Connectivity>(
                bloc: _connectivity,
                builder: (_, state) => ConnectivityBanner(state: state, onRetry: _connectivity.check),
              ),
            ),
            Expanded(
              child: IndexedStack(
                index: _tab,
                children: const [FlowApp(), GalleryScreen()],
              ),
            ),
          ],
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
