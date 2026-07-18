// App configuration. The ONE place to point the client at a backend.
//
// The app is blind to which backend answers; it only knows this base URL (the API Gateway).
// Point it at an external HTTPS tunnel — the address a real phone (and the simulator) can reach
// and trust. Run `make up && make tunnel` (ngrok; Cloudflare Tunnel works too) and pass its URL:
//
//   EXPO_PUBLIC_BASE_URL=https://<your-tunnel-host>/api npx expo start
//
// See docs/recipes/expose-with-a-tunnel.md. Never use a local IP: https://localhost/api only
// works on the same machine and an Android emulator would need https://10.0.2.2/api — both
// dev-only, and a physical phone reaches neither.

export const AppConfig = {
  /** The API Gateway base URL. Override with EXPO_PUBLIC_BASE_URL. */
  baseUrl: process.env.EXPO_PUBLIC_BASE_URL ?? 'https://localhost/api',
  /** How long a reachability probe waits before declaring the server unreachable. */
  reachabilityTimeoutMs: 4000,
  /**
   * When false the app runs on in-memory demo data (works with no backend). Enable the real
   * gateway with EXPO_PUBLIC_USE_REAL_BACKEND=true: real HTTP repositories, a session with
   * refresh rotation, and a login screen gating the flow.
   */
  useRealBackend: process.env.EXPO_PUBLIC_USE_REAL_BACKEND === 'true',
} as const;
