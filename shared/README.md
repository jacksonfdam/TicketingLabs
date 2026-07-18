# /shared — single-sourced client assets

Three apps, one truth. Everything a client could be tempted to reinvent lives here
once and is consumed by all three. The rule is boring on purpose: if two apps would
otherwise hand-write the same thing, it belongs in this folder.

| Folder | What it holds | Consumed as |
|---|---|---|
| [`contract/`](contract/) | The OpenAPI spec | Generated DTOs/types per platform. No hand-written models. |
| [`tokens/`](tokens/) | `tokens.json` — colour, spacing, type, radius, motion | Each design system reads these instead of guessing hex codes. |
| [`scenarios/`](scenarios/) | The canonical flow + failure list | Test names and recipe steps reference scenario ids. |
| [`copy/`](copy/) | Error-code → user-facing string map | One error mapper per app reads this so wording matches. |

What is deliberately **not** here: language-specific code. Kotlin does not import Dart.
The three apps share artefacts, not source. Trying to share the source is how you get a
fourth, worse framework nobody asked for.

## Where the truth actually lives

The backend lab is the source; `/shared` is the mirror the clients read. The contract
in particular is copied from [`../contract/openapi.yaml`](../contract/openapi.yaml) — see
[`contract/README.md`](contract/README.md) for how to keep the copy honest.
