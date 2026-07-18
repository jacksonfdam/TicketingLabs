/// A slim server-reachability banner. Shows nothing when online, a muted line while
/// checking, and an error line with Retry when offline. It informs; it never blocks.
library;

import 'package:flutter/material.dart';

import '../presentation/connectivity_cubit.dart';
import 'theme.dart';

class ConnectivityBanner extends StatelessWidget {
  final Connectivity state;
  final VoidCallback onRetry;
  const ConnectivityBanner({required this.state, required this.onRetry, super.key});

  @override
  Widget build(BuildContext context) {
    switch (state) {
      case Connectivity.online:
        return const SizedBox.shrink();
      case Connectivity.checking:
        return _bar('Checking connection…', Tokens.surfaceAlt, Tokens.muted);
      case Connectivity.offline:
        return _bar('Server unreachable — working offline', Tokens.err, Colors.white, onRetry);
    }
  }

  Widget _bar(String message, Color background, Color content, [VoidCallback? onRetry]) {
    return Container(
      width: double.infinity,
      color: background,
      padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceLg, vertical: Tokens.spaceSm),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(child: Text(message, style: TextStyle(color: content))),
          if (onRetry != null)
            TextButton(onPressed: onRetry, child: Text('Retry', style: TextStyle(color: content))),
        ],
      ),
    );
  }
}
