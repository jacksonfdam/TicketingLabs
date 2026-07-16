/// Repository ports: the boundary between business logic and the outside world. Use cases
/// depend on these, never on dio. Each returns a validated domain model in an [Outcome];
/// invalid data becomes a typed failure, never an exception that escapes.
library;

import '../core/core.dart';
import 'models.dart';

abstract interface class EventRepository {
  Future<Outcome<EventPage>> listEvents({String? cursor, int? limit});
  Future<Outcome<EventDetail>> getEvent(String id);
}

abstract interface class QueueRepository {
  Future<Outcome<QueueToken>> join(String eventId);
  Future<Outcome<QueueToken>> status(String eventId);
}

abstract interface class ReservationRepository {
  /// Creates a hold. [idempotencyKey] makes a retried create a no-op, so a double tap
  /// cannot create two reservations.
  Future<Outcome<Reservation>> create(String sectorId, int quantity, String idempotencyKey);
  Future<Outcome<void>> release(String id);
}

abstract interface class OrderRepository {
  /// Creates an order, triggering async payment. [idempotencyKey] protects retries after a
  /// network drop or unknown-outcome timeout.
  Future<Outcome<Order>> create(String reservationId, String idempotencyKey);
  Future<Outcome<Order>> get(String id);
}

/// Produces client-side idempotency keys. A port so tests inject a deterministic sequence.
abstract interface class IdempotencyKeyFactory {
  String newKey();
}
