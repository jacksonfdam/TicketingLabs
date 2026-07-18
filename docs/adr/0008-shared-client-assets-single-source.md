# 8. Client apps share artefacts, not source

Date: 2026-07-16

## Status

Accepted

## Context

Three apps in three languages will, left alone, hand-write the same DTOs, invent three
palettes, describe the same errors three slightly different ways, and test three
different subsets of the flow. Each drift is small; together they turn "the same app three
times" into "three apps that rhyme".

The obvious over-correction is to share source code across platforms. That fails: Kotlin,
Dart and TypeScript do not import each other, and a shared abstraction layer would become
a fourth framework nobody chose to maintain.

## Decision

Share **artefacts**, not source. Everything single-sourceable lives in
[`/shared`](../../shared/) and is consumed by all three apps:

- `contract/` — the OpenAPI spec; each platform **generates** DTOs/types from it. No
  hand-written models.
- `tokens/` — `tokens.json`; each design system reads it instead of guessing hex codes.
- `scenarios/` — the canonical flow + failure list; tests and recipes reference ids.
- `copy/` — error-code → message map; one error mapper per app reads it.

Within an app, deduplicate ruthlessly: one HTTP client config, one error mapper, one
logging facade. Across apps, share only the four artefacts above.

## Consequences

- Consistency is enforced by construction, not by review. Two apps cannot disagree about
  a colour or an error message, because they read the same file.
- Each artefact needs a generation or sync step per platform (codegen for the contract,
  token generation, a JSON reader for copy). That is real setup cost, paid once per app.
- The contract in `/shared` is a mirror of the backend lab's `contract/openapi.yaml` and
  can rot; keeping it honest is a documented diff/sync step, not an assumption. See
  [`shared/contract/README.md`](../../shared/contract/README.md).
