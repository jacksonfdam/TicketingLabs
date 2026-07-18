/// Server reachability: a bounded, one-shot probe so the app never blocks on the network.
library;

import 'package:dio/dio.dart';

/// Probes whether the gateway is reachable right now.
abstract interface class ReachabilityChecker {
  /// True if the gateway answered `/health` within the timeout. Never throws, never hangs:
  /// any failure (offline, refused, slow, non-2xx) returns false.
  Future<bool> isServerReachable();
}

/// A dio-based reachability check with a short timeout.
class DioReachabilityChecker implements ReachabilityChecker {
  final String baseUrl;
  final Duration timeout;
  DioReachabilityChecker(this.baseUrl, {this.timeout = const Duration(seconds: 4)});

  @override
  Future<bool> isServerReachable() async {
    final base = baseUrl.endsWith('/') ? baseUrl : '$baseUrl/';
    final dio = Dio(BaseOptions(
      connectTimeout: timeout,
      receiveTimeout: timeout,
      validateStatus: (_) => true,
    ));
    try {
      final response = await dio.getUri(Uri.parse('${base}health'));
      final status = response.statusCode ?? 0;
      return status >= 200 && status < 300;
    } catch (_) {
      return false; // offline, refused, timed out, TLS error: not reachable now
    } finally {
      dio.close(force: true);
    }
  }
}
