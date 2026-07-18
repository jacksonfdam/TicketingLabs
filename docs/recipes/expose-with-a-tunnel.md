# Recipe: test against an external HTTPS URL with a tunnel

Applies to every client: the web SPA and all three mobile apps.

## Problem

`localhost` is a lie the moment a second device is involved. A real phone cannot reach your
machine's `localhost`; an Android emulator needs `10.0.2.2`; an iOS simulator can use
`localhost` but a device cannot; and the gateway's local TLS is a self-signed cert nothing
trusts, so every client would need a pinning bypass. Chasing local IPs and cert exceptions per
device is a waste of a morning. The client should always consume one real, external HTTPS URL.

## Concept

Put a tunnel in front of the gateway. The gateway serves both the SPA (`/`) and the API
(`/api`) on port 80; a tunnel exposes that port as a public `https://…` URL with valid TLS it
terminates for you. Every client points its base URL at `<tunnel>/api` — no local IP, no
self-signed cert, reachable from any device on any network. The base URL is the only thing a
client knows about the backend, so this is a one-line change per client and nothing else moves.

## How to run it

1. Bring the infrastructure up:

   ```bash
   make up
   ```

2. Start a tunnel to the gateway (port 80). **ngrok** (preferred):

   ```bash
   make tunnel          # wraps: ngrok http 80
   ```

   ngrok prints a forwarding URL like `https://a1b2c3d4.ngrok-free.app`. That origin now serves
   the SPA at `/` and the API at `/api`.

   **Cloudflare Tunnel** (alternative, no account needed for a quick tunnel):

   ```bash
   cloudflared tunnel --url http://localhost:80
   ```

   It prints a `https://<random>.trycloudflare.com` URL. For a stable hostname, create a named
   tunnel (`cloudflared tunnel create ticketing` + a `config.yml` mapping a hostname to
   `http://localhost:80`) instead of the quick tunnel.

3. Point each client at `<tunnel>/api`:

   | Client | Set it here |
   |---|---|
   | Web (Vite) | `VITE_API_BASE_URL=https://a1b2c3d4.ngrok-free.app/api` (or just open the tunnel URL — the SPA is served behind the gateway too) |
   | KMP | `AppConfig.DEFAULT_BASE_URL = "https://a1b2c3d4.ngrok-free.app/api"` |
   | Flutter | `flutter run --dart-define=BASE_URL=https://a1b2c3d4.ngrok-free.app/api` |
   | React Native | `EXPO_PUBLIC_BASE_URL=https://a1b2c3d4.ngrok-free.app/api npx expo start` |

## Gotchas

- **Tunnel the HTTP port (80), not the self-signed HTTPS (443).** The tunnel provides its own
  valid TLS; pointing it at the local 443 just re-wraps a cert nothing trusts.
- **ngrok's browser interstitial.** On the free tier, a browser hitting the URL first sees an
  HTML warning page — click through once for the SPA. Non-browser clients (the mobile HTTP
  stacks send their own User-Agent) pass straight through; if one ever hits the interstitial,
  send the header `ngrok-skip-browser-warning: true`. Cloudflare quick tunnels have no
  interstitial, which makes them the smoother choice for the SPA.
- **The URL changes on restart** with ngrok free and Cloudflare quick tunnels. A reserved ngrok
  domain or a Cloudflare named tunnel gives a stable hostname worth wiring into the config.
- **Swapping the backend is still one line.** Change the compose profile and re-`make up`; the
  tunnel and every client stay exactly as they are. That is the whole point of the contract.

## Trade-offs

A tunnel adds a hop of latency and puts a (obscure, temporary) public URL in front of your dev
stack — fine for a demo, never for anything with real secrets. ngrok is the smoothest to start;
Cloudflare Tunnel is free and gives a stable hostname with a named tunnel at the cost of a
little more setup. Either way the clients are identical: one external HTTPS base URL, no local
IPs anywhere.
