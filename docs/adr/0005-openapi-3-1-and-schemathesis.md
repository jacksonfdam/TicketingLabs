# 5. OpenAPI 3.1.0 with Schemathesis 3.1 support enabled

Date: 2026-07-16

## Status

Accepted

## Context

The contract is written in OpenAPI 3.1.0, the current version, which aligns the JSON
Schema dialect with standard JSON Schema and lets us express nullable fields as
`type: [string, "null"]` instead of the 3.0 `nullable: true` wart.

Schemathesis 3.39.5, our contract-test fuzzer, treats 3.1 as experimental and refuses
to load such a spec unless the support is explicitly enabled.

## Decision

Keep the contract at 3.1.0 and enable Schemathesis's 3.1 support with
`schemathesis.experimental.OPEN_API_3_1.enable()` in the test harness. We do not
downgrade the contract to 3.0.3 to placate one tool.

We also document a shared `400 Bad Request` response on every operation. Fuzzing
proved the HTTP layer legitimately returns 400 for malformed requests (a corrupt
pagination cursor at the application level, or control characters in a header that the
server rejects before the application runs). The contract now tells the truth about
this, including that protocol-level rejections may carry a plain-text body rather than
the JSON envelope.

## Consequences

- The contract uses modern, correct syntax.
- The test harness carries one line of setup and a comment pointing here.
- A future Schemathesis that supports 3.1 by default makes that line redundant; it is
  harmless until then.
- Documenting the 400 forced us to fix a real bug: a malformed cursor used to reach
  Postgres and return 500. It now returns 400 before touching the database. The fuzzer
  earned its keep on day one.
