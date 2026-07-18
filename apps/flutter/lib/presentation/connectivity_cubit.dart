/// State holder for the connectivity banner. Always resolves — no infinite spinner.
library;

import 'package:flutter_bloc/flutter_bloc.dart';

import '../data/reachability.dart';

enum Connectivity { checking, online, offline }

/// Probes the gateway once and resolves [Connectivity.checking] to online/offline within the
/// checker's timeout. The app stays usable while offline (offline-first): this only informs.
class ConnectivityCubit extends Cubit<Connectivity> {
  final ReachabilityChecker _checker;
  ConnectivityCubit(this._checker) : super(Connectivity.checking) {
    check();
  }

  Future<void> check() async {
    emit(Connectivity.checking);
    final reachable = await _checker.isServerReachable();
    if (!isClosed) emit(reachable ? Connectivity.online : Connectivity.offline);
  }
}
