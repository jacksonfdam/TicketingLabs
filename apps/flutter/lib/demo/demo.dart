/// In-memory repositories that behave like a well-behaved backend, so the demo runs the
/// whole flow with no server. A demo aid; the real adapters are the Http* repositories.
library;

import '../core/core.dart';
import '../domain/models.dart';
import '../domain/repositories.dart';

final _demoEvents = <Event>[
  Event(id: 'e1', name: 'Skyline Festival', venue: 'Riverside Park', startsAt: DateTime(2026, 8), salesOpenAt: DateTime(2026, 7), status: EventStatus.onSale),
  Event(id: 'e2', name: 'Midnight Orchestra', venue: 'Grand Hall', startsAt: DateTime(2026, 9), salesOpenAt: DateTime(2026, 7), status: EventStatus.onSale),
  Event(id: 'e3', name: "Last Year's Reunion", venue: 'The Old Venue', startsAt: DateTime(2026, 6), salesOpenAt: DateTime(2026, 5), status: EventStatus.soldOut),
];

EventDetail _detail(String id) => EventDetail(
      event: _demoEvents.firstWhere((e) => e.id == id, orElse: () => _demoEvents.first),
      sectors: [
        Sector(id: 's1', eventId: id, name: 'Front stage', price: Money(9500, 'GBP'), totalInventory: 100, availableInventory: 12),
        Sector(id: 's2', eventId: id, name: 'Stands', price: Money(5500, 'GBP'), totalInventory: 500, availableInventory: 240),
        Sector(id: 's3', eventId: id, name: 'Restricted view', price: Money(2500, 'GBP'), totalInventory: 50, availableInventory: 0),
      ],
    );

class DemoEventRepository implements EventRepository {
  @override
  Future<Outcome<EventPage>> listEvents({String? cursor, int? limit}) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    return Success(EventPage(events: _demoEvents, nextCursor: null));
  }

  @override
  Future<Outcome<EventDetail>> getEvent(String id) async {
    await Future<void>.delayed(const Duration(milliseconds: 200));
    return Success(_detail(id));
  }
}

class DemoQueueRepository implements QueueRepository {
  int _polls = 0;
  @override
  Future<Outcome<QueueToken>> join(String eventId) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    return Success(QueueToken(id: 'q1', userId: 'u1', eventId: eventId, position: 3, status: QueueStatus.waiting, admittedAt: null));
  }

  @override
  Future<Outcome<QueueToken>> status(String eventId) async {
    _polls++;
    if (_polls >= 3) {
      return Success(QueueToken(id: 'q1', userId: 'u1', eventId: eventId, position: 0, status: QueueStatus.admitted, admittedAt: DateTime(2026)));
    }
    return Success(QueueToken(id: 'q1', userId: 'u1', eventId: eventId, position: 3 - _polls, status: QueueStatus.waiting, admittedAt: null));
  }
}

class DemoReservationRepository implements ReservationRepository {
  @override
  Future<Outcome<Reservation>> create(String sectorId, int quantity, String idempotencyKey) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    return Success(Reservation(id: 'r1', userId: 'u1', sectorId: sectorId, quantity: quantity, status: ReservationStatus.held, expiresAt: DateTime(2026)));
  }

  @override
  Future<Outcome<void>> release(String id) async => Success<void>(null);
}

class DemoOrderRepository implements OrderRepository {
  int _polls = 0;
  @override
  Future<Outcome<Order>> create(String reservationId, String idempotencyKey) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    return Success(Order(id: 'o1', reservationId: reservationId, userId: 'u1', amountCents: 9500, status: OrderStatus.pending, createdAt: DateTime(2026)));
  }

  @override
  Future<Outcome<Order>> get(String id) async {
    _polls++;
    final status = _polls >= 3 ? OrderStatus.paid : OrderStatus.pending;
    return Success(Order(id: id, reservationId: 'r1', userId: 'u1', amountCents: 9500, status: status, createdAt: DateTime(2026)));
  }
}

class DemoIdempotencyKeyFactory implements IdempotencyKeyFactory {
  int _n = 0;
  @override
  String newKey() => 'demo-idem-${_n++}';
}
