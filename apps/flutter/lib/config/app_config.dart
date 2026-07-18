/// App configuration. The ONE place to point the client at a backend.
///
/// The app is blind to which backend answers; it only knows this base URL (the API
/// Gateway). Point it at an external HTTPS tunnel — the address a real phone (and the
/// simulator) can reach and trust. Run `make up && make tunnel` (ngrok; Cloudflare Tunnel
/// works too) and inject its URL at build time:
///
///   flutter run --dart-define=BASE_URL=https://YOUR_TUNNEL_HOST/api
///
/// See docs/recipes/expose-with-a-tunnel.md. Never use a local IP: `https://localhost/api` only
/// works on the same machine and an Android emulator would need `https://10.0.2.2/api` — both
/// dev-only, and a physical phone reaches neither.
library;

class AppConfig {
  /// The API Gateway base URL. Defaults to the backend lab's local gateway; override with
  /// `--dart-define=BASE_URL=...`.
  static const String baseUrl = String.fromEnvironment('BASE_URL', defaultValue: 'https://localhost/api');

  /// How long a reachability probe waits before declaring the server unreachable.
  static const Duration reachabilityTimeout = Duration(seconds: 4);

  /// When false the app runs on in-memory demo data (works with no backend). Enable the real
  /// gateway with `--dart-define=USE_REAL_BACKEND=true`: real HTTP repositories, a session with
  /// refresh rotation, and a login screen gating the flow.
  static const bool useRealBackend = bool.fromEnvironment('USE_REAL_BACKEND', defaultValue: false);
}
