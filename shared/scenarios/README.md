# /shared/scenarios — the canonical scenario list

`scenarios.json` is the list of things that must work and the ways they are allowed to
break. Tests and recipes reference scenarios by id, so `payment-unknown-outcome` is the
same demand in all three apps. It is the checklist the Definition of Done is graded
against.

Three groups:

- `flow` — the happy path, one entry per screen of the seven-screen flow.
- `failure` — how each screen is allowed to fail, each tagged with a taxonomy error
  from [`../copy/errors.json`](../copy/errors.json).
- `payment` — the payment matrix, modelled as start/end states. This is the part that
  earns its keep.

## The one that matters: `payment-unknown-outcome`

The payment gateway times out. You do not know whether the charge went through. The
naive app assumes failure, the user pays again, and now you owe someone a refund and an
apology. The correct app assumes nothing, keeps the order in a "confirming" state, and
reconciles by polling. Idempotency keys mean the retry is free; polling means the truth
arrives eventually. No double-charge, no false failure. Everything else in this folder
is warm-up for this scenario.

## A note on `timeout`

The spec's Order Status screen lists `timeout` as a state, but the contract's `Order.status`
enum is `pending | paid | failed | refunded` — no `timeout`. So `timeout` is a
**client-side** state: the app gave up waiting, not the server declaring an outcome. It
is modelled as `PaymentUnknown` / `TimedOut`, never as a server status. See
[`docs/client-state-machines.md`](../../docs/client-state-machines.md).
