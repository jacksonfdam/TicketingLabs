# Fake payment gateway

An external payment provider, minus the fees, the downtime you cannot control, and
the compliance paperwork. It exists so the backends have something to be resilient
*against*.

## Endpoints

- `POST /charges` — body `{ "order_id": "<uuid>" }`. Returns `202` with a
  `provider_ref` and settles asynchronously by calling the backend webhook.
- `POST /admin/failure-mode` — body `{ "mode": "ok" | "fail" | "timeout" }`.
  Changes behaviour at runtime, no restart. This is the lever for the resilience demos.
  - `ok` settles as `succeeded`
  - `fail` settles as `failed`
  - `timeout` never calls back at all, so the backend's timeout has to do the work
- `GET /health` — liveness, also reports the current mode.

## Signed webhooks

After a charge settles, the gateway POSTs to `WEBHOOK_TARGET_URL` with header
`X-Signature: hex(HMAC_SHA256(secret, raw_body))`. Backends verify this before
trusting the payload. See the webhook-signature recipe (Phase 4).

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `PORT` | `9090` | listen port |
| `PAYMENT_WEBHOOK_SECRET` | `dev_webhook_secret` | HMAC key, shared with backends |
| `WEBHOOK_TARGET_URL` | `http://gateway/api/webhooks/payment` | where callbacks go |
| `PAYMENT_SETTLE_DELAY_S` | `1.0` | artificial settle latency |

## Trying it locally

```bash
docker compose up -d payment-gateway-fake
curl -s localhost:9090/health
curl -s -XPOST localhost:9090/admin/failure-mode -d '{"mode":"fail"}'
curl -s -XPOST localhost:9090/charges -d '{"order_id":"11111111-1111-1111-1111-111111111111"}'
```
