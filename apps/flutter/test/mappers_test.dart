import 'package:flutter_test/flutter_test.dart';
import 'package:ticketing_client/data/mappers.dart';
import 'package:ticketing_client/domain/models.dart';

void main() {
  group('defensive mapping', () {
    test('parses an event page and ignores unknown fields', () {
      final page = eventPageFromJson({
        'data': [
          {
            'id': 'e1',
            'name': 'Show',
            'venue': 'O2',
            'starts_at': '2026-08-01T20:00:00Z',
            'sales_open_at': '2026-07-20T10:00:00Z',
            'status': 'on_sale',
            'surprise': 'ignore me', // not in the contract
          }
        ],
        'next_cursor': null,
      });
      expect(page.events.length, 1);
      expect(page.events.first.status, EventStatus.onSale);
      expect(page.nextCursor, isNull);
    });

    test('rejects an unknown enum value', () {
      expect(
        () => eventDetailFromJson({
          'id': 'e1', 'name': 'x', 'venue': 'y',
          'starts_at': '2026-08-01T20:00:00Z', 'sales_open_at': '2026-07-20T10:00:00Z',
          'status': 'on_fire', 'sectors': [],
        }),
        throwsA(isA<MappingException>()),
      );
    });

    test('rejects an unparseable timestamp', () {
      expect(
        () => eventFromJson({
          'id': 'e1', 'name': 'x', 'venue': 'y',
          'starts_at': 'not-a-date', 'sales_open_at': '2026-07-20T10:00:00Z', 'status': 'on_sale',
        }),
        throwsA(isA<MappingException>()),
      );
    });

    test('rejects a missing required field', () {
      expect(() => eventFromJson({'id': 'e1'}), throwsA(isA<MappingException>()));
    });

    test('rejects a sector whose available exceeds total (domain invariant)', () {
      expect(
        () => sectorFromJson({
          'id': 's1', 'event_id': 'e1', 'name': 'VIP',
          'price_cents': 1000, 'currency': 'GBP', 'total_inventory': 10, 'available_inventory': 20,
        }),
        throwsA(isA<MappingException>()),
      );
    });
  });
}
