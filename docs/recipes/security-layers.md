# Recipe: security in every layer

## 1. Problem

Security is not a feature you add; it is a property of every layer, and a single missing
control is the one an attacker uses. A ticketing sale handles credentials, money, and a
scarce resource people will cheat for. The question this recipe answers: where is each
defence, and can you point at it in the code?

## 2. Concept

Defence in depth — each layer assumes the ones around it might fail:

- **Edge**: TLS, rate limiting, security headers, restrictive CSP.
- **Gateway ↔ service**: mutual TLS (never trust the network).
- **Application**: authn/authz, strict input validation, idempotency, error envelopes
  that leak nothing.
- **Data**: least-privilege database role, hashed passwords, encryption at rest.

## 3. Implementation — the section-8 checklist, mapped to code

| Control | Where |
|---|---|
| JWT access + refresh **rotation** | `platform/token.go`; recipe: [jwt-refresh-rotation](jwt-refresh-rotation.md) |
| **mTLS** gateway ↔ backend | `cmd/server/main.go` + `infra/tls/`; recipe: [mtls-gateway-backend](mtls-gateway-backend.md) |
| **Rate limiting** (edge + per-user) | `infra/gateway/dynamic.yml`, `redisadp.go`; recipe: [rate-limiting](rate-limiting.md) |
| **Input validation** | every use case validates before acting (`reservation.go`: qty/idem-key; DTOs reject malformed bodies → 400/422) |
| **TLS at the edge** | Traefik `websecure` + self-signed dev cert (`infra/gateway/`) |
| **Secrets from env, never in code** | `config` packages read env; `.env`/certs gitignored; [ADR 0004](../adr/0004-secrets-management.md) |
| **Errors leak nothing** | one envelope, `{code, message, request_id}`; internal errors collapse to a generic 500 (`domain/errors.go`, transport filters) |
| **CORS restrictive / security headers** | same-origin SPA (no CORS needed); HSTS/nosniff/frame-deny at the gateway, CSP from the SPA's nginx |
| **Webhook signature verification** | HMAC-SHA256, constant-time compare (`handlers.go` `validSignature`) |
| **Least privilege** | app connects as `ticketing_app` (SELECT/INSERT/UPDATE/DELETE only, no DDL); verified it is denied `CREATE TABLE` ([ADR 0004](../adr/0004-secrets-management.md), `0002_app_role.sql`) |

## 4. Encryption at rest

- **Passwords are never stored, encrypted or otherwise** — they are bcrypt *hashes*
  (`platform` `BcryptHasher`), which is the correct treatment (one-way, salted, slow). A
  breach of the DB does not reveal passwords.
- **Refresh tokens** live in Redis with a TTL and are opaque handles, not secrets that
  decrypt anything.
- **Sensitive columns / disk**: the seed carries no card numbers or PII beyond email, so
  there is nothing here to field-encrypt. The at-rest strategy for a real deployment is
  documented rather than implemented: encrypt the Postgres and Redis **volumes**
  (cloud-managed disk encryption, or LUKS), and for individual sensitive columns use
  `pgcrypto` (`pgp_sym_encrypt`) with keys from the same secret store the app secrets come
  from. This is the one checklist item the lab documents but does not build, because
  there is no sensitive payload in the domain to encrypt.

## 5. How to see it working

Each control has its own verification (see the linked recipes). Quick tour:

```bash
curl -sk https://localhost/api/events/00000000-0000-0000-0000-000000000000   # error envelope, no stack trace
curl -sk -XPOST https://localhost/api/webhooks/payment -d '{}'                # 401: unsigned webhook rejected
# least privilege: the app role cannot alter schema
docker compose exec -e PGPASSWORD=app_local_dev_only postgres psql -U ticketing_app -d ticketing -c "CREATE TABLE x(i int);"  # permission denied
```

## 6. Trade-offs

- **Self-signed TLS and a committed dev CA script are for local only.** Production uses a
  real CA (ACME/cert-manager) and a secret manager; the lab is explicit that anything
  ending in `_local_dev_only` protects nothing real.
- **mTLS and full at-rest encryption are shown/documented on the reference path**, not
  wired into all seven backends or the datastores — deliberate scoping, called out so the
  gap is visible rather than implied-complete.
- **Defence in depth costs latency and moving parts.** Every layer is another thing to
  operate. The payoff is that no single failure is fatal; the cost is that there is more
  to run and rotate.
