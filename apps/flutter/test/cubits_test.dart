import 'package:flutter_test/flutter_test.dart';
import 'package:ticketing_client/core/core.dart';
import 'package:ticketing_client/domain/models.dart';
import 'package:ticketing_client/domain/repositories.dart';
import 'package:ticketing_client/domain/usecases.dart';
import 'package:ticketing_client/presentation/cubits.dart';

Order _order(OrderStatus s) => Order(
    id: 'o1', reservationId: 'r1', userId: 'u1', amountCents: 1000, status: s, createdAt: DateTime(2026));

Reservation _res() => Reservation(
    id: 'r1', userId: 'u1', sectorId: 's1', quantity: 2, status: ReservationStatus.held, expiresAt: DateTime(2026));

class FixedKeys implements IdempotencyKeyFactory {
  int n = 0;
  @override
  String newKey() => 'key-${n++}';
}

class ScriptedEvents implements EventRepository {
  final Outcome<EventPage> result;
  ScriptedEvents(this.result);
  @override
  Future<Outcome<EventPage>> listEvents({String? cursor, int? limit}) async => result;
  @override
  Future<Outcome<EventDetail>> getEvent(String id) async => Failure(UnknownError());
}

class SlowReservationRepo implements ReservationRepository {
  final keysSeen = <String>[];
  @override
  Future<Outcome<Reservation>> create(String sectorId, int quantity, String key) async {
    await Future<void>.delayed(const Duration(milliseconds: 20));
    keysSeen.add(key);
    return Success(_res());
  }
  @override
  Future<Outcome<void>> release(String id) async => Success<void>(null);
}

class ScriptedOrders implements OrderRepository {
  final List<Outcome<Order>> creates;
  final List<Outcome<Order>> gets;
  final createKeys = <String>[];
  ScriptedOrders({required this.creates, required this.gets});
  @override
  Future<Outcome<Order>> create(String reservationId, String key) async {
    createKeys.add(key);
    return creates.length > 1 ? creates.removeAt(0) : creates.first;
  }
  @override
  Future<Outcome<Order>> get(String id) async => gets.length > 1 ? gets.removeAt(0) : gets.first;
}

void main() {
  test('EventsCubit: empty page maps to UiEmpty', () async {
    final cubit = EventsCubit(ScriptedEvents(const Success(EventPage(events: [], nextCursor: null))));
    await cubit.load();
    expect(cubit.state, isA<UiEmpty<List<Event>>>());
  });

  test('EventsCubit: a network failure maps to UiError', () async {
    final cubit = EventsCubit(ScriptedEvents(Failure(NetworkUnavailable())));
    await cubit.load();
    expect(cubit.state, isA<UiError<List<Event>>>());
  });

  test('ReservationCubit: a double tap fires one request with one key', () async {
    final repo = SlowReservationRepo();
    final cubit = ReservationCubit(CreateReservationUseCase(repo), FixedKeys());
    final first = cubit.reserve('s1', 2);
    final second = cubit.reserve('s1', 2); // ignored: first still in flight
    await Future.wait([first, second]);
    expect(repo.keysSeen, ['key-0']);
    expect(cubit.state, isA<UiSuccess<Reservation>>());
  });

  test('OrderCubit: unknown outcome on create is reconciled with the same key, then settles', () async {
    final repo = ScriptedOrders(
      creates: [Failure(PaymentUnknown()), Failure(PaymentUnknown()), Success(_order(OrderStatus.pending))],
      gets: [Success(_order(OrderStatus.paid))],
    );
    final cubit = OrderCubit(CreateOrderUseCase(repo), repo, FixedKeys(),
        interval: const Duration(milliseconds: 1));
    await cubit.checkout('r1');
    expect(cubit.state, isA<UiSuccess<Order>>());
    expect((cubit.state as UiSuccess<Order>).data.status, OrderStatus.paid);
    expect(repo.createKeys, ['key-0', 'key-0', 'key-0']);
  });

  test('OrderCubit: a real failure on create surfaces as an error', () async {
    final repo = ScriptedOrders(
      creates: [Failure(Conflict(backendCode: 'reservation_expired'))],
      gets: [Success(_order(OrderStatus.pending))],
    );
    final cubit = OrderCubit(CreateOrderUseCase(repo), repo, FixedKeys(),
        interval: const Duration(milliseconds: 1));
    await cubit.checkout('r1');
    expect(cubit.state, isA<UiError<Order>>());
  });
}
