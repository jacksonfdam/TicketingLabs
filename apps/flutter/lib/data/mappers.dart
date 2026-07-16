/// Defensive DTO→domain mapping. Every function validates the raw JSON and throws
/// [MappingException] on anything it cannot trust: a missing field, a wrong type, an
/// unknown enum value, an unparseable date, or a domain-invariant violation. The executor
/// turns that into a [MalformedResponse]. This is the zero-trust boundary.
library;

import '../domain/models.dart';

/// Thrown when a payload cannot be turned into a valid domain model.
class MappingException implements Exception {
  final String message;
  MappingException(this.message);
  @override
  String toString() => 'MappingException: $message';
}

String _str(Map json, String key) {
  final v = json[key];
  if (v is String) return v;
  throw MappingException("missing or non-string field '$key'");
}

int _int(Map json, String key) {
  final v = json[key];
  if (v is int) return v;
  throw MappingException("missing or non-int field '$key'");
}

String? _strOrNull(Map json, String key) {
  final v = json[key];
  if (v == null) return null;
  if (v is String) return v;
  throw MappingException("non-string field '$key'");
}

DateTime _date(Map json, String key) {
  final raw = _str(json, key);
  try {
    return DateTime.parse(raw);
  } on FormatException {
    throw MappingException("unparseable timestamp '$raw' in '$key'");
  }
}

Map _asMap(dynamic json) {
  if (json is Map) return json;
  throw MappingException('expected a JSON object');
}

EventStatus _eventStatus(String raw) => switch (raw) {
      'draft' => EventStatus.draft,
      'on_sale' => EventStatus.onSale,
      'sold_out' => EventStatus.soldOut,
      'closed' => EventStatus.closed,
      _ => throw MappingException("unknown event status '$raw'"),
    };

QueueStatus _queueStatus(String raw) => switch (raw) {
      'waiting' => QueueStatus.waiting,
      'admitted' => QueueStatus.admitted,
      'expired' => QueueStatus.expired,
      _ => throw MappingException("unknown queue status '$raw'"),
    };

ReservationStatus _reservationStatus(String raw) => switch (raw) {
      'held' => ReservationStatus.held,
      'confirmed' => ReservationStatus.confirmed,
      'released' => ReservationStatus.released,
      'expired' => ReservationStatus.expired,
      _ => throw MappingException("unknown reservation status '$raw'"),
    };

OrderStatus _orderStatus(String raw) => switch (raw) {
      'pending' => OrderStatus.pending,
      'paid' => OrderStatus.paid,
      'failed' => OrderStatus.failed,
      'refunded' => OrderStatus.refunded,
      _ => throw MappingException("unknown order status '$raw'"),
    };

/// Wraps domain-invariant [ArgumentError]s as [MappingException].
T _guarded<T>(T Function() build) {
  try {
    return build();
  } on ArgumentError catch (e) {
    throw MappingException(e.message?.toString() ?? 'domain invariant violated');
  }
}

Event eventFromJson(dynamic json) {
  final m = _asMap(json);
  return _guarded(() => Event(
        id: _str(m, 'id'),
        name: _str(m, 'name'),
        venue: _str(m, 'venue'),
        startsAt: _date(m, 'starts_at'),
        salesOpenAt: _date(m, 'sales_open_at'),
        status: _eventStatus(_str(m, 'status')),
      ));
}

Sector sectorFromJson(dynamic json) {
  final m = _asMap(json);
  return _guarded(() => Sector(
        id: _str(m, 'id'),
        eventId: _str(m, 'event_id'),
        name: _str(m, 'name'),
        price: Money(_int(m, 'price_cents'), _str(m, 'currency')),
        totalInventory: _int(m, 'total_inventory'),
        availableInventory: _int(m, 'available_inventory'),
      ));
}

EventDetail eventDetailFromJson(dynamic json) {
  final m = _asMap(json);
  final sectors = (m['sectors'] as List?) ?? (throw MappingException('missing sectors'));
  return EventDetail(event: eventFromJson(m), sectors: sectors.map(sectorFromJson).toList());
}

EventPage eventPageFromJson(dynamic json) {
  final m = _asMap(json);
  final data = (m['data'] as List?) ?? (throw MappingException('missing data'));
  return EventPage(events: data.map(eventFromJson).toList(), nextCursor: _strOrNull(m, 'next_cursor'));
}

QueueToken queueTokenFromJson(dynamic json) {
  final m = _asMap(json);
  return _guarded(() => QueueToken(
        id: _str(m, 'id'),
        userId: _str(m, 'user_id'),
        eventId: _str(m, 'event_id'),
        position: _int(m, 'position'),
        status: _queueStatus(_str(m, 'status')),
        admittedAt: m['admitted_at'] == null ? null : _date(m, 'admitted_at'),
      ));
}

Reservation reservationFromJson(dynamic json) {
  final m = _asMap(json);
  return _guarded(() => Reservation(
        id: _str(m, 'id'),
        userId: _str(m, 'user_id'),
        sectorId: _str(m, 'sector_id'),
        quantity: _int(m, 'quantity'),
        status: _reservationStatus(_str(m, 'status')),
        expiresAt: _date(m, 'expires_at'),
      ));
}

Order orderFromJson(dynamic json) {
  final m = _asMap(json);
  return Order(
    id: _str(m, 'id'),
    reservationId: _str(m, 'reservation_id'),
    userId: _str(m, 'user_id'),
    amountCents: _int(m, 'amount_cents'),
    status: _orderStatus(_str(m, 'status')),
    createdAt: _date(m, 'created_at'),
  );
}
