/// App configuration. The ONE place to point the client at a backend.
///
/// The app is blind to which backend answers; it only knows this base URL (the API
/// Gateway). Override [baseUrl] at build time without editing code:
///
///   flutter run --dart-define=BASE_URL=https://<subdomain>.ngrok-free.app/api
///
/// For real devices, prefer an external HTTPS tunnel over a local IP: run `make tunnel` and
/// pass its URL. See docs/recipes/expose-with-a-tunnel.md. (Local run: `https://localhost/api`;
/// Android emulator: `https://10.0.2.2/api`; a physical phone reaches neither.)
library;

class AppConfig {
  /// The API Gateway base URL. Defaults to the backend lab's local gateway; override with
  /// `--dart-define=BASE_URL=...`.
  static const String baseUrl = String.fromEnvironment('BASE_URL', defaultValue: 'https://localhost/api');

  /// How long a reachability probe waits before declaring the server unreachable.
  static const Duration reachabilityTimeout = Duration(seconds: 4);
}
