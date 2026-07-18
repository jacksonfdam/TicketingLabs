# /shared/copy — error-code → message map

`errors.json` is the one place the apps agree on what to say when something breaks.
Without it you get three subtly different apologies for the same 409, and QA files three
bugs. Two layers:

- `taxonomy` — the app-side typed error taxonomy every platform models:
  `NetworkUnavailable`, `Timeout`, `Unauthorized`, `Forbidden`, `RateLimited`,
  `Conflict`, `Validation`, `ServerError`, `MalformedResponse`, `PaymentDeclined`,
  `PaymentUnknown`, `Unknown`. Each carries a `title`, a `message`, and a `recovery`
  affordance the UI turns into a button.
- `backendCodes` — the contract's `error.code` strings mapped onto a taxonomy key. The
  app reads `error.code` off the envelope, looks up the taxonomy bucket, and renders
  that bucket's copy.

## Flow

```
HTTP response ──► error.code ──► backendCodes[code] ──► taxonomy[key] ──► title/message/recovery
                     │
                     └─ absent / unknown code ──► taxonomy["Unknown"]
```

Transport failures never reach a `code` (there is no response), so the client assigns
the taxonomy key directly: a dropped socket is `NetworkUnavailable`, a slow one is
`Timeout`.

## Honesty about the codes

The contract documents exactly one concrete `error.code` by example: `inventory_exhausted`.
The rest of `backendCodes` (`reservation_expired`, `sold_out`, `queue_not_admitted`, …)
are the codes the clients **expect** and map defensively. If a real backend emits a code
not in this map, the client falls through to `Unknown` and still renders a sane state —
which is the whole point of not trusting the backend. When the backends pin their real
code strings, this file is where they get reconciled.

`recovery` is one of: `retry`, `back`, `refresh`, `signin`, `wait`, `none`.
