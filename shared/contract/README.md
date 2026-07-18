# /shared/contract — the API contract, mirrored

`openapi.yaml` here is a copy of the backend lab's [`contract/openapi.yaml`](../../contract/openapi.yaml).
It exists so the client apps depend on `/shared` and never reach across into the
backend's folders. Same file, different address.

Because it is a copy, it can rot. Keep it honest:

```bash
# from the repo root — fails loudly if the mirror has drifted
diff contract/openapi.yaml shared/contract/openapi.yaml

# recopy the source over the mirror when it has
make contract-sync
```

If the diff prints anything, the mirror is stale; `make contract-sync` recopies the
source over it.

## Code generation

No app hand-writes DTOs. Each generates them from this file:

| Platform | Generator | Output |
|---|---|---|
| KMP | OpenAPI Generator (`kotlin` client) or a kotlinx-serialization codegen | `commonMain` DTOs |
| Flutter | OpenAPI Generator (`dart-dio`) | generated models + `dio` client |
| React Native | `openapi-typescript` | `paths`/`components` types for `ky`/`fetch` |

Generator configs land beside this file (`kmp/`, `flutter/`, `react-native/`) as each
app is scaffolded. The reference React frontend already does this — see
[`frontend/src/api/schema.d.ts`](../../frontend/src/api/schema.d.ts), which is generated,
never edited by hand. The clients follow the same discipline.

## What the contract guarantees (and the client leans on)

- Every response carries `X-Request-Id`. The client propagates it into logs.
- Errors use one envelope: `{ "error": { "code", "message", "request_id" } }`.
- Every mutating endpoint accepts `Idempotency-Key`; `/reservations` requires it.
- Listings paginate by opaque cursor.

The client trusts none of this at runtime anyway. See the scenarios for `malformed-response`.
A contract is a promise, and the app is old enough to know what those are worth.
