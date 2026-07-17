import 'package:flutter_test/flutter_test.dart';
import 'package:ticketing_client/data/reachability.dart';
import 'package:ticketing_client/presentation/connectivity_cubit.dart';

class FakeChecker implements ReachabilityChecker {
  final bool reachable;
  FakeChecker(this.reachable);
  @override
  Future<bool> isServerReachable() async => reachable;
}

void main() {
  test('a reachable server resolves to online (never stays checking)', () async {
    final cubit = ConnectivityCubit(FakeChecker(true));
    await cubit.stream.firstWhere((s) => s != Connectivity.checking);
    expect(cubit.state, Connectivity.online);
    await cubit.close();
  });

  test('an unreachable server resolves to offline', () async {
    final cubit = ConnectivityCubit(FakeChecker(false));
    await cubit.stream.firstWhere((s) => s != Connectivity.checking);
    expect(cubit.state, Connectivity.offline);
    await cubit.close();
  });
}
