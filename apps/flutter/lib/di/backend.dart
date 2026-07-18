/// The composition root's dependency graph: demo (in-memory) or real (HTTP + session).
library;

import 'dart:math';

import '../data/api.dart';
import '../data/auth.dart';
import '../data/cache.dart';
import '../demo/demo.dart';
import '../domain/repositories.dart';

/// [session] is null in demo mode (no auth); the app shows the login screen only when a real
/// [SessionManager] is present and has no token.
class Backend {
  final CachingEventRepository events;
  final QueueRepository queue;
  final ReservationRepository reservations;
  final OrderRepository orders;
  final IdempotencyKeyFactory keys;
  final SessionManager? session;
  Backend({
    required this.events,
    required this.queue,
    required this.reservations,
    required this.orders,
    required this.keys,
    this.session,
  });
}

/// In-memory data, no auth. Runs with no backend.
Backend demoBackend() => Backend(
      events: CachingEventRepository(DemoEventRepository()),
      queue: DemoQueueRepository(),
      reservations: DemoReservationRepository(),
      orders: DemoOrderRepository(),
      keys: DemoIdempotencyKeyFactory(),
    );

/// Real HTTP repositories against the gateway, with a session and refresh rotation.
Backend realBackend(ApiConfig config) {
  // Auth calls go through a session-less executor so refresh does not carry a stale token.
  final authExecutor = ApiExecutor(buildDio(config));
  final session = SessionManager(InMemoryTokenStore(), HttpAuthRepository(authExecutor));
  final executor = ApiExecutor(buildDio(config), session: session);
  return Backend(
    events: CachingEventRepository(HttpEventRepository(executor)),
    queue: HttpQueueRepository(executor),
    reservations: HttpReservationRepository(executor),
    orders: HttpOrderRepository(executor),
    keys: _RandomKeyFactory(),
    session: session,
  );
}

class _RandomKeyFactory implements IdempotencyKeyFactory {
  final Random _random = Random.secure();
  @override
  String newKey() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}
