/// Validated domain models, mapped from the contract. Immutable value types; invalid data
/// is rejected at construction so a half-valid object never propagates.
library;

enum EventStatus { draft, onSale, soldOut, closed }

enum QueueStatus { waiting, admitted, expired }

enum ReservationStatus { held, confirmed, released, expired }

enum OrderStatus { pending, paid, failed, refunded }

/// A monetary amount in minor units plus an ISO-4217 currency code. Never a double.
class Money {
  final int amountCents;
  final String currency;
  Money(this.amountCents, this.currency) {
    if (amountCents < 0) throw ArgumentError('amountCents must be >= 0');
    if (currency.length != 3) throw ArgumentError('currency must be 3 letters');
  }
}

class Event {
  final String id;
  final String name;
  final String venue;
  final DateTime startsAt;
  final DateTime salesOpenAt;
  final EventStatus status;
  const Event({
    required this.id,
    required this.name,
    required this.venue,
    required this.startsAt,
    required this.salesOpenAt,
    required this.status,
  });
}

class Sector {
  final String id;
  final String eventId;
  final String name;
  final Money price;
  final int totalInventory;
  final int availableInventory;
  Sector({
    required this.id,
    required this.eventId,
    required this.name,
    required this.price,
    required this.totalInventory,
    required this.availableInventory,
  }) {
    if (totalInventory < 0) throw ArgumentError('totalInventory must be >= 0');
    if (availableInventory < 0 || availableInventory > totalInventory) {
      throw ArgumentError('availableInventory out of range');
    }
  }

  bool get isSoldOut => availableInventory <= 0;
}

class EventDetail {
  final Event event;
  final List<Sector> sectors;
  const EventDetail({required this.event, required this.sectors});
}

class EventPage {
  final List<Event> events;
  final String? nextCursor;
  const EventPage({required this.events, required this.nextCursor});
}

class QueueToken {
  final String id;
  final String userId;
  final String eventId;
  final int position;
  final QueueStatus status;
  final DateTime? admittedAt;
  QueueToken({
    required this.id,
    required this.userId,
    required this.eventId,
    required this.position,
    required this.status,
    required this.admittedAt,
  }) {
    if (position < 0) throw ArgumentError('position must be >= 0');
  }

  bool get isAdmitted => status == QueueStatus.admitted;
}

class Reservation {
  final String id;
  final String userId;
  final String sectorId;
  final int quantity;
  final ReservationStatus status;
  final DateTime expiresAt;
  Reservation({
    required this.id,
    required this.userId,
    required this.sectorId,
    required this.quantity,
    required this.status,
    required this.expiresAt,
  }) {
    if (quantity < 1) throw ArgumentError('quantity must be >= 1');
  }

  bool get isHeld => status == ReservationStatus.held;
}

class Order {
  final String id;
  final String reservationId;
  final String userId;
  final int amountCents;
  final OrderStatus status;
  final DateTime createdAt;
  const Order({
    required this.id,
    required this.reservationId,
    required this.userId,
    required this.amountCents,
    required this.status,
    required this.createdAt,
  });

  bool get isPending => status == OrderStatus.pending;
  bool get isSettled => status != OrderStatus.pending;
}

/// A pair of tokens from the auth endpoints. The access token travels on every request; the
/// refresh token is long-lived, rotates on use, and belongs in the platform secure store.
class TokenPair {
  final String accessToken;
  final String refreshToken;
  final int expiresInSeconds;
  const TokenPair({required this.accessToken, required this.refreshToken, required this.expiresInSeconds});
}
