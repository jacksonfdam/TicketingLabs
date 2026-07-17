# Recipe: certificate (public-key) pinning against the gateway

Cross-platform: Kotlin Multiplatform, Flutter, React Native.

## Problem

TLS proves you are talking to *a* server with a valid certificate — not that it is *your*
server. A compromised or coerced CA, or a corporate MITM proxy, can present a valid cert for
your host and read everything. Pinning says: trust this connection only if the server's key
(or cert) matches one I shipped. The catch is that pinning is a production posture; in
development you talk to `localhost`, self-signed certs, and rotating tunnel certs, so pinning
must be off there or nothing connects.

## Concept

Pin the **public key** (SPKI SHA-256), not the certificate — the key usually survives cert
renewal, so a routine renewal doesn't brick every installed app. Ship one or two pins (a
primary and a backup key) for the real gateway host only. Gate it behind a flag that is off in
debug and on in release, so `make tunnel` (whose cert is ngrok's or Cloudflare's, and rotates)
and `localhost` keep working while development, and the production gateway is pinned in the
shipped build.

## Implementation ×3

**KMP (Ktor)** — pinning lives in the platform engine, not commonMain.

Android (OkHttp engine):

```kotlin
OkHttp {
    config {
        certificatePinner(
            CertificatePinner.Builder()
                .add("gateway.example.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
                .add("gateway.example.com", "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=") // backup key
                .build(),
        )
    }
}
```

iOS (Darwin engine) uses `handleChallenge { session, task, challenge, completionHandler -> … }`
to evaluate the server trust and compare the leaf's public-key hash before accepting.

**Flutter (dio)** — swap the IO adapter's client and verify the fingerprint:

```dart
(dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
  final client = HttpClient();
  client.badCertificateCallback = (cert, host, port) => spkiSha256(cert) == kGatewayPin;
  return client;
};
```

(`badCertificateCallback` only fires for otherwise-rejected certs; for a valid chain, verify
the pin in an interceptor instead. The `http_certificate_pinning` package wraps both.)

**React Native (Expo)** — `fetch`/`ky` cannot pin in JS; pinning is native config applied by a
config plugin. Android via a network-security-config XML (`<pin-set>`), iOS via `NSPinnedDomains`
in `Info.plist`, both injected through `expo-build-properties` or a small config plugin. Or use
`react-native-ssl-pinning`'s `fetch` for the pinned calls.

## The dev bypass

```
pinningEnabled = isRelease && baseUrl is the production gateway host
```

Never pin a tunnel or `localhost`: ngrok/Cloudflare present their own certificate, and it
rotates. Pin the stable production hostname only, in release builds. This is the switch the
spec asks for, and forgetting it is the classic "works on my machine, bricks in QA" bug.

## How to see it work

Pin the wrong hash and the pinned build refuses to connect (a TLS failure the executor maps to
`NetworkUnavailable`); pin the right one and it connects; point the same build at the tunnel
with pinning off and it connects there too. There is nothing to unit-test — pinning is a real
TLS handshake — so this is verified by pointing a release build at a gateway with a known key.

## Trade-offs

Pinning is the highest-friction security control there is: rotate a key without shipping the
new pin first and every installed app stops working until they update. That is why you pin the
public key (not the cert), ship a backup pin, and keep a remote kill-switch in mind. It is off
in this lab's dev flow on purpose — the tunnel and self-signed localhost make pinning
counterproductive there — and documented here as the production posture.
