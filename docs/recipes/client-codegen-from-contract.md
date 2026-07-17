# Recipe: generating wire types from the OpenAPI contract

Cross-platform: Kotlin Multiplatform, Flutter, React Native.

## Problem

Hand-writing the JSON shapes the gateway sends is busywork that rots: the contract changes,
someone forgets to update a field, and the drift is found at runtime by a user. The wire
types should come *from* the contract, mechanically, so a change to `openapi.yaml` shows up as
a compile error, not a support ticket.

## Concept

Generate the **wire DTOs** from `shared/contract/openapi.yaml` and keep the **domain models**
hand-written. The two are not the same thing: the wire type is `snake_case`, nullable where
the network is, and only as trustworthy as the sender; the domain model is validated,
`camelCase`, and the shape the app actually reasons about. The mapper is the seam between
them — and the one place that still validates at runtime, because a generated type is a
promise about the shape, not a guarantee about the bytes.

## Implementation

**React Native — wired end-to-end.** `openapi-typescript` turns the contract into a types
file; `npm run generate:contract` regenerates it.

```jsonc
// package.json
"generate:contract": "openapi-typescript ../../shared/contract/openapi.yaml -o src/contract/schema.ts"
```

`src/contract/dto.ts` aliases the generated component schemas, and the mappers' enum maps are
typed against the generated unions — so a renamed or added contract status stops compiling
until it is handled:

```ts
import type { EventDto, OrderDto } from '../contract/dto';

const ORDER_STATUS: Record<OrderDto['status'], OrderStatus> = {
  pending: 'pending', paid: 'paid', failed: 'failed', refunded: 'refunded',
};
// add "partially_refunded" to the contract and this object no longer compiles.
```

The runtime validation in the mappers is unchanged — the generated type documents and
type-checks the boundary; it does not replace the zero-trust parse.

**Kotlin Multiplatform** and **Flutter** reach the same place with a different tool: the
[OpenAPI Generator](https://openapi-generator.tech) emits model classes — `@Serializable`
Kotlin data classes for KMP, `json_serializable` classes for Flutter — from the same
`openapi.yaml`. The generated models feed the same DTO→domain mappers; the domain layer and
the HTTP executor stay hand-written, because that is where the app's guarantees live. The
generator is model-only on purpose: a generated *client* would drag in its own HTTP stack and
its own idea of error handling, and this lab keeps both.

## Comparison

- **React Native** has the lightest tool: `openapi-typescript` emits types (no runtime code),
  which slot straight into a hand-written mapper with zero ceremony. This is why it is the
  worked example here.
- **KMP / Flutter** generators emit real classes, which is more powerful (serialization
  included) and heavier (a Java toolchain, a build step, generated source to keep out of the
  way). Model-only generation keeps them from taking over the client.

## How to see it work

Change a field name in `shared/contract/openapi.yaml` (say `amount_cents` → `total_cents`),
run `npm run generate:contract` in the React Native app, and watch `tsc` fail at the order
mapper — the drift is caught at build time, exactly where you want it.

## Trade-offs

Committing generated code is a small sin that buys reproducibility (the repo builds without
the generator installed) and lets the site show the artefact; regenerate on every contract
change. Generating the *wire* types but not the *domain* models is deliberate: it removes the
boilerplate that should be mechanical while keeping the validation and the domain shape, which
should be deliberate, in human hands.
