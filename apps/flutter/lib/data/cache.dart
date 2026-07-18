/// A read-through cache in front of an [EventRepository].
library;

import '../core/core.dart';
import '../domain/models.dart';
import '../domain/repositories.dart';

class _Entry<T> {
  final T value;
  final DateTime at;
  _Entry(this.value, this.at);
}

/// Caches the first page and each event detail for [ttl] (matching the events endpoint's
/// `Cache-Control: max-age=30`), so a refresh within the window is free and shows no spinner.
/// Only successes are cached. [invalidate] drops everything; the reservation flow calls it
/// because a hold changes availability. [now] is injected so tests control time.
class CachingEventRepository implements EventRepository {
  final EventRepository _delegate;
  final Duration _ttl;
  final DateTime Function() _now;
  CachingEventRepository(this._delegate, {this._ttl = const Duration(seconds: 30), DateTime Function()? now})
      : _now = now ?? DateTime.now;

  _Entry<EventPage>? _page;
  final Map<String, _Entry<EventDetail>> _details = {};

  @override
  Future<Outcome<EventPage>> listEvents({String? cursor, int? limit}) async {
    if (cursor == null && _page != null && _now().difference(_page!.at) < _ttl) {
      return Success(_page!.value);
    }
    final result = await _delegate.listEvents(cursor: cursor, limit: limit);
    if (cursor == null && result is Success<EventPage>) _page = _Entry(result.value, _now());
    return result;
  }

  @override
  Future<Outcome<EventDetail>> getEvent(String id) async {
    final entry = _details[id];
    if (entry != null && _now().difference(entry.at) < _ttl) return Success(entry.value);
    final result = await _delegate.getEvent(id);
    if (result is Success<EventDetail>) _details[id] = _Entry(result.value, _now());
    return result;
  }

  /// Drops all cached reads. Called after a reservation, since availability changed.
  void invalidate() {
    _page = null;
    _details.clear();
  }
}
