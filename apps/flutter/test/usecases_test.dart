import 'package:flutter_test/flutter_test.dart';
import 'package:ticketing_client/core/core.dart';
import 'package:ticketing_client/domain/models.dart';
import 'package:ticketing_client/domain/repositories.dart';
import 'package:ticketing_client/domain/usecases.dart';

Reservation _sampleReservation() => Reservation(
      id: 'r1', userId: 'u1', sectorId: 's1', quantity: 2,
      status: ReservationStatus.held, expiresAt: DateTime(2026));

Order _order(OrderStatus status) => Order(
      id: 'o1', reservationId: 'r1', userId: 'u1', amountCents: 1000,
      status: status, createdAt: DateTime(2026));

class FakeReservationRepo implements ReservationRepository {
  final keysSeen = <String>[];
  final Outcome<Reservation> Function() answer;
  FakeReservationRepo([Outcome<Reservation> Function()? a])
      : answer = a ?? (() => Success(_sampleReservation()));
  @override
  Future<Outcome<Reservation>> create(String sectorId, int quantity, String key) async {
    keysSeen.add(key);
    return answer();
  }
  @override
  Future<Outcome<void>> release(String id) async => Success<void>(null);
}

class FakeOrderRepo implements OrderRepository {
  final Outcome<Order> Function() onCreate;
  FakeOrderRepo(this.onCreate);
  @override
  Future<Outcome<Order>> create(String reservationId, String key) async => onCreate();
  @override
  Future<Outcome<Order>> get(String id) async => onCreate();
}

void main() {
  group('CreateReservationUseCase', () {
    test('rejects an out-of-range quantity without touching the repo', () async {
      final repo = FakeReservationRepo();
      final result = await CreateReservationUseCase(repo)('s1', 0, 'k');
      expect(result, isA<Failure<Reservation>>());
      expect((result as Failure<Reservation>).error, isA<Validation>());
      expect(repo.keysSeen, isEmpty);
    });

    test('passes a valid quantity and the key through', () async {
      final repo = FakeReservationRepo();
      final result = await CreateReservationUseCase(repo)('s1', 2, 'idem-1');
      expect(result, isA<Success<Reservation>>());
      expect(repo.keysSeen, ['idem-1']);
    });
  });

  group('CreateOrderUseCase', () {
    test('maps a create timeout to PaymentUnknown, not a failure', () async {
      final uc = CreateOrderUseCase(FakeOrderRepo(() => Failure(TimeoutError())));
      final result = await uc('r1', 'k');
      expect((result as Failure<Order>).error, isA<PaymentUnknown>());
    });

    test('maps a network drop to PaymentUnknown', () async {
      final uc = CreateOrderUseCase(FakeOrderRepo(() => Failure(NetworkUnavailable())));
      final result = await uc('r1', 'k');
      expect((result as Failure<Order>).error, isA<PaymentUnknown>());
    });

    test('passes a real conflict through unchanged', () async {
      final uc = CreateOrderUseCase(FakeOrderRepo(() => Failure(Conflict(backendCode: 'reservation_expired'))));
      final result = await uc('r1', 'k');
      expect((result as Failure<Order>).error, isA<Conflict>());
    });
  });

  group('reconcileOrderPoll', () {
    test('a paid order resolves', () {
      expect(reconcileOrderPoll(Success(_order(OrderStatus.paid))), isA<Resolved>());
    });
    test('a pending order continues', () {
      expect(reconcileOrderPoll(Success(_order(OrderStatus.pending))), isA<Continue>());
    });
    test('a transient failure continues', () {
      expect(reconcileOrderPoll(Failure(TimeoutError())), isA<Continue>());
      expect(reconcileOrderPoll(Failure(PaymentUnknown())), isA<Continue>());
    });
    test('a non-transient failure aborts', () {
      expect(reconcileOrderPoll(Failure(Unauthorized())), isA<Abort>());
    });
  });
}
