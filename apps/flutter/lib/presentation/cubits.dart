/// State holders as Cubits. Each exposes a stream of [UiState] the UI renders as a pure
/// function. The order cubit owns the payment reconcile-and-poll loop.
library;

import 'package:flutter_bloc/flutter_bloc.dart';

import '../core/core.dart';
import '../domain/models.dart';
import '../domain/repositories.dart';
import '../domain/usecases.dart';

/// Events list. An empty page is [UiEmpty]; a failure is a typed error state; a reload after
/// failure is [UiRetrying].
class EventsCubit extends Cubit<UiState<List<Event>>> {
  final EventRepository _repo;
  bool _inFlight = false;
  EventsCubit(this._repo) : super(const UiIdle());

  Future<void> load({bool isRetry = false}) async {
    if (_inFlight) return;
    _inFlight = true;
    emit(isRetry ? const UiRetrying() : const UiLoading());
    final result = await _repo.listEvents();
    if (!isClosed) {
      switch (result) {
        case Success(value: final page):
          emit(page.events.isEmpty ? const UiEmpty() : UiSuccess(page.events));
        case Failure(error: final e):
          emit(errorToUiState(e));
      }
    }
    _inFlight = false;
  }
}

/// Reservation, with the double-tap defences: an in-flight guard and one stable idempotency
/// key reused across retries of the intent.
class ReservationCubit extends Cubit<UiState<Reservation>> {
  final CreateReservationUseCase _create;
  final IdempotencyKeyFactory _keys;
  bool _inFlight = false;
  String? _intentKey;
  ReservationCubit(this._create, this._keys) : super(const UiIdle());

  Future<void> reserve(String sectorId, int quantity) async {
    if (_inFlight) return;
    _inFlight = true;
    final key = _intentKey ??= _keys.newKey();
    emit(const UiLoading());
    final result = await _create(sectorId, quantity, key);
    if (!isClosed) {
      switch (result) {
        case Success(value: final r):
          emit(UiSuccess(r));
        case Failure(error: final e):
          emit(errorToUiState(e));
      }
    }
    _inFlight = false;
  }

  void reset() {
    _intentKey = null;
    emit(const UiIdle());
  }
}

/// Waiting room: join, then poll position until admitted. Rate-limits back off; transient
/// poll failures keep polling; only a non-transient error stops the loop.
class WaitingRoomCubit extends Cubit<UiState<QueueToken>> {
  final QueueRepository _repo;
  final Duration _interval;
  bool _running = false;
  WaitingRoomCubit(this._repo, {this._interval = const Duration(milliseconds: 1500)}) : super(const UiIdle());

  Future<void> start(String eventId) async {
    if (_running) return;
    _running = true;
    emit(const UiLoading());
    final joined = await _repo.join(eventId);
    if (joined is Failure<QueueToken>) {
      if (!isClosed) emit(errorToUiState(joined.error));
      _running = false;
      return;
    }
    if (!isClosed) emit(UiSuccess((joined as Success<QueueToken>).value));

    while (_running && !isClosed) {
      final current = state;
      if (current is UiSuccess<QueueToken> && current.data.isAdmitted) break;
      await Future<void>.delayed(_interval);
      if (!_running || isClosed) break;
      final result = await _repo.status(eventId);
      switch (result) {
        case Success(value: final token):
          emit(UiSuccess(token));
        case Failure(error: final e):
          if (e is RateLimited) {
            await Future<void>.delayed(Duration(seconds: e.retryAfterSeconds ?? 1));
          } else if (e is TimeoutError || e is NetworkUnavailable) {
            // transient; keep polling
          } else {
            if (!isClosed) emit(errorToUiState(e));
            _running = false;
          }
      }
    }
    _running = false;
  }

  void stop() => _running = false;

  @override
  Future<void> close() {
    _running = false;
    return super.close();
  }
}

/// Checkout and settlement — the careful one. Creates the order, reconciling an unknown
/// outcome by retrying with the same key, then polls until settled. Never reports a false
/// failure on an unknown payment.
class OrderCubit extends Cubit<UiState<Order>> {
  final CreateOrderUseCase _create;
  final OrderRepository _orders;
  final IdempotencyKeyFactory _keys;
  final Duration _interval;
  final int _maxUnknownRetries;
  bool _running = false;
  String? _intentKey;

  OrderCubit(
    this._create,
    this._orders,
    this._keys, {
    this._interval = const Duration(seconds: 1),
    this._maxUnknownRetries = 5,
  }) : super(const UiIdle());

  Future<void> checkout(String reservationId) async {
    if (_running) return;
    _running = true;
    final key = _intentKey ??= _keys.newKey();
    emit(const UiLoading());
    final order = await _createReconciling(reservationId, key);
    if (order == null) {
      _running = false;
      return;
    }
    if (!isClosed) emit(UiSuccess(order));
    await _pollUntilSettled(order.id);
    _running = false;
  }

  Future<Order?> _createReconciling(String reservationId, String key) async {
    var attempts = 0;
    while (_running && !isClosed) {
      final result = await _create(reservationId, key);
      if (result is Success<Order>) return result.value;
      final error = (result as Failure<Order>).error;
      if (error is PaymentUnknown) {
        if (!isClosed) emit(UiError<Order>(error)); // "confirming payment", recovery = wait
        if (++attempts >= _maxUnknownRetries) return null;
        await Future<void>.delayed(_interval);
      } else {
        if (!isClosed) emit(errorToUiState<Order>(error));
        return null;
      }
    }
    return null;
  }

  Future<void> _pollUntilSettled(String id) async {
    while (_running && !isClosed) {
      final decision = reconcileOrderPoll(await _orders.get(id));
      switch (decision) {
        case Resolved(order: final o):
          if (!isClosed) emit(UiSuccess(o));
          return;
        case Continue():
          await Future<void>.delayed(_interval);
        case Abort(error: final e):
          if (!isClosed) emit(errorToUiState<Order>(e));
          return;
      }
    }
  }

  void stop() => _running = false;

  @override
  Future<void> close() {
    _running = false;
    return super.close();
  }
}
