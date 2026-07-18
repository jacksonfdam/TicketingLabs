/// The flow shell: seven screens, one linear flow, plus a login gate. The composition root —
/// it builds the demo or real dependency graph and drives navigation.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'config/app_config.dart';
import 'core/core.dart';
import 'data/api.dart';
import 'di/backend.dart';
import 'domain/models.dart';
import 'domain/usecases.dart';
import 'presentation/cubits.dart';
import 'ui/login_screen.dart';
import 'ui/screens.dart';

enum _Screen { events, detail, waiting, sectors, reservation, order }

class FlowApp extends StatefulWidget {
  const FlowApp({super.key});
  @override
  State<FlowApp> createState() => _FlowAppState();
}

class _FlowAppState extends State<FlowApp> {
  late final Backend _backend =
      AppConfig.useRealBackend ? realBackend(ApiConfig(baseUrl: AppConfig.baseUrl)) : demoBackend();

  late final EventsCubit _events = EventsCubit(_backend.events);
  late final WaitingRoomCubit _waiting = WaitingRoomCubit(_backend.queue, interval: const Duration(milliseconds: 800));
  late final ReservationCubit _reservation = ReservationCubit(CreateReservationUseCase(_backend.reservations), _backend.keys);
  late final OrderCubit _order = OrderCubit(CreateOrderUseCase(_backend.orders), _backend.orders, _backend.keys, interval: const Duration(milliseconds: 600));

  // Demo mode has no session, so it starts "logged in"; real mode gates on sign-in.
  late bool _loggedIn = _backend.session == null;
  UiState<void> _loginState = const UiIdle();

  _Screen _screen = _Screen.events;
  EventDetail? _detail;
  int _remainingMs = 120000;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  /// Restores a persisted session (real mode) before deciding whether to show login, then
  /// loads events. The hydrate is a bounded local read, so this never hangs the first frame.
  Future<void> _boot() async {
    final restored = await _backend.hydrateSession?.call() ?? false;
    if (!mounted) return;
    if (restored) setState(() => _loggedIn = true);
    if (_loggedIn) _events.load();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _events.close();
    _waiting.close();
    _reservation.close();
    _order.close();
    super.dispose();
  }

  Future<void> _submitLogin(String email, String password) async {
    setState(() => _loginState = const UiLoading());
    final result = await _backend.session!.login(email, password);
    if (!mounted) return;
    setState(() {
      if (result is Success<TokenPair>) {
        _loggedIn = true;
        _loginState = const UiIdle();
        _events.load();
      } else if (result is Failure<TokenPair>) {
        _loginState = errorToUiState<void>(result.error);
      }
    });
  }

  Future<void> _openEvent(Event event) async {
    setState(() {
      _detail = null;
      _screen = _Screen.detail;
    });
    final result = await _backend.events.getEvent(event.id);
    if (!mounted) return;
    setState(() => _detail = result is Success<EventDetail> ? result.value : null);
  }

  void _startCountdown() {
    _timer?.cancel();
    setState(() => _remainingMs = 120000);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _remainingMs -= 1000);
      if (_remainingMs <= 0) t.cancel();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_backend.session != null && !_loggedIn) {
      return LoginScreen(state: _loginState, onSubmit: _submitLogin);
    }
    switch (_screen) {
      case _Screen.events:
        return BlocBuilder<EventsCubit, UiState<List<Event>>>(
          bloc: _events,
          builder: (_, state) => EventsScreen(
            state: state,
            onOpen: _openEvent,
            onRetry: () => _events.load(isRetry: true),
          ),
        );
      case _Screen.detail:
        return EventDetailScreen(
          state: _detail == null ? const UiLoading() : UiSuccess(_detail!),
          onJoinQueue: () {
            _waiting.start(_detail!.event.id);
            setState(() => _screen = _Screen.waiting);
          },
          onRetry: () => _detail == null ? null : _openEvent(_detail!.event),
        );
      case _Screen.waiting:
        return BlocBuilder<WaitingRoomCubit, UiState<QueueToken>>(
          bloc: _waiting,
          builder: (_, state) => WaitingRoomScreen(
            state: state,
            onContinue: () => setState(() => _screen = _Screen.sectors),
            onRetry: () => _detail != null ? _waiting.start(_detail!.event.id) : null,
          ),
        );
      case _Screen.sectors:
        return SectorSelectionScreen(
          detail: _detail!,
          onReserve: (sector, quantity) {
            _reservation.reserve(sector.id, quantity);
            _backend.events.invalidate(); // the hold changed availability; drop cached reads
            _startCountdown();
            setState(() => _screen = _Screen.reservation);
          },
        );
      case _Screen.reservation:
        return BlocBuilder<ReservationCubit, UiState<Reservation>>(
          bloc: _reservation,
          builder: (_, state) => ReservationScreen(
            state: state,
            remainingMs: _remainingMs,
            onCheckout: () {
              if (state is UiSuccess<Reservation>) {
                _order.checkout(state.data.id);
                setState(() => _screen = _Screen.order);
              }
            },
            onRetry: () => _detail?.sectors.isNotEmpty == true ? _reservation.reserve(_detail!.sectors.first.id, 1) : null,
          ),
        );
      case _Screen.order:
        return BlocBuilder<OrderCubit, UiState<Order>>(
          bloc: _order,
          builder: (_, state) => OrderStatusScreen(
            state: state,
            onDone: () => setState(() => _screen = _Screen.events),
            onRetry: () {
              final r = _reservation.state;
              if (r is UiSuccess<Reservation>) _order.checkout(r.data.id);
            },
          ),
        );
    }
  }
}
