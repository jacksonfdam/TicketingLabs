// App configuration. The ONE place to point the client at a backend.
//
// The app is blind to which backend answers; it only knows this base URL (the API Gateway).
// Override without editing code via an Expo public env var:
//
//   EXPO_PUBLIC_BASE_URL=https://10.0.2.2/api npx expo start
//
// On an Android emulator the host machine is `10.0.2.2`, not `localhost`.

export const AppConfig = {
  /** The API Gateway base URL. Override with EXPO_PUBLIC_BASE_URL. */
  baseUrl: process.env.EXPO_PUBLIC_BASE_URL ?? 'https://localhost/api',
  /** How long a reachability probe waits before declaring the server unreachable. */
  reachabilityTimeoutMs: 4000,
} as const;
