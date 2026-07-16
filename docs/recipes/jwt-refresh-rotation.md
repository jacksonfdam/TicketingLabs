# Recipe: JWT access tokens with refresh rotation

## 1. Problem

A ticketing session outlives any single request, but a long-lived credential is a
liability: if it leaks, the attacker has it until it expires. You want tokens short
enough that a leak is a small window, without forcing the user to re-enter their password
every fifteen minutes. And if a refresh token is stolen, you want to detect and stop it.

## 2. Concept

Two tokens with different jobs:

- A short-lived **access token** — a stateless, signed JWT (HS256) carrying the user id
  and role. The server verifies the signature; no lookup needed. It expires in minutes.
- A long-lived **refresh token** — an opaque handle stored server-side. When the access
  token expires, the client spends the refresh token for a new pair. **Rotation** means
  the old refresh token is revoked the instant it is used, and a new one issued. Replay a
  spent refresh token and it is already gone — which is how theft surfaces.

## 3. Implementation

`backends/go/internal/platform/token.go`. Access tokens are HS256 JWTs; refresh tokens
are random ids stored in Redis and consumed atomically on rotation:

```go
func (s *TokenService) Rotate(ctx context.Context, refreshToken string) (string, error) {
    userID, ok, err := s.store.Consume(ctx, refreshToken) // Redis GETDEL — atomic
    if err != nil { return "", err }
    if !ok { return "", domain.ErrInvalidToken }          // unknown, expired, or already spent
    return userID, nil
}
```

The atomic `GETDEL` (`internal/adapter/redisadp/redisadp.go`) is the crux: a token can be
spent exactly once, so two concurrent uses cannot both succeed. The contract endpoint
`POST /auth/refresh` returns a fresh pair; the old refresh token no longer works.

## 4. How to see it working

```bash
# log in, capture the refresh token, use it once (works), use it again (401)
R=$(curl -sk -XPOST https://localhost/api/auth/login -d '{"email":"buyer@ticketing.local","password":"password123"}' | jq -r .refresh_token)
curl -sk -XPOST https://localhost/api/auth/refresh -d "{\"refresh_token\":\"$R\"}"   # 200, new pair
curl -sk -o /dev/null -w '%{http_code}\n' -XPOST https://localhost/api/auth/refresh -d "{\"refresh_token\":\"$R\"}"  # 401
```

The contract test `test_openapi_conformance` and the manual smoke both cover this; a
reused refresh token is a `401`.

## 5. Trade-offs

- **Stateful refresh tokens need storage.** Access tokens stay stateless (fast, no
  lookup), but refresh tokens live in Redis, so logout/revocation works — at the cost of
  a dependency on the refresh path.
- **Rotation can bite legitimate clients.** If two tabs refresh at once, one wins and the
  other's token is suddenly invalid. A grace window or per-device refresh tokens softens
  this; the lab keeps the strict version because it makes theft detection crisp.
- **HS256 shares one secret.** Every backend signs and verifies with the same key. That
  is fine for one service; a fleet that must verify without being able to mint would use
  asymmetric RS256/EdDSA instead.
