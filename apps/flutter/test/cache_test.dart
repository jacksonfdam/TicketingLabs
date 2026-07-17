import 'package:flutter_test/flutter_test.dart';
import 'package:ticketing_client/core/core.dart';
import 'package:ticketing_client/data/cache.dart';
import 'package:ticketing_client/domain/models.dart';
import 'package:ticketing_client/domain/repositories.dart';

Event _event(String id) =>
    Event(id: id, name: 'Show', venue: 'O2', startsAt: DateTime(2026), salesOpenAt: DateTime(2026), status: EventStatus.onSale);

class CountingEvents implements EventRepository {
  int listCalls = 0;
  int getCalls = 0;
  @override
  Future<Outcome<EventPage>> listEvents({String? cursor, int? limit}) async {
    listCalls++;
    return Success(EventPage(events: [_event('e1')], nextCursor: null));
  }
  @override
  Future<Outcome<EventDetail>> getEvent(String id) async {
    getCalls++;
    return Success(EventDetail(event: _event(id), sectors: const []));
  }
}

void main() {
  test('a second read within the TTL is served from cache', () async {
    final delegate = CountingEvents();
    final cache = CachingEventRepository(delegate, now: () => DateTime(2026, 1, 1));
    await cache.listEvents();
    await cache.listEvents();
    expect(delegate.listCalls, 1);
  });

  test('a read after the TTL refetches', () async {
    final delegate = CountingEvents();
    var t = DateTime(2026, 1, 1);
    final cache = CachingEventRepository(delegate, ttl: const Duration(seconds: 30), now: () => t);
    await cache.listEvents();
    t = t.add(const Duration(seconds: 31));
    await cache.listEvents();
    expect(delegate.listCalls, 2);
  });

  test('invalidate forces a refetch', () async {
    final delegate = CountingEvents();
    final cache = CachingEventRepository(delegate, now: () => DateTime(2026, 1, 1));
    await cache.getEvent('e1');
    await cache.getEvent('e1');
    expect(delegate.getCalls, 1);
    cache.invalidate();
    await cache.getEvent('e1');
    expect(delegate.getCalls, 2);
  });
}
