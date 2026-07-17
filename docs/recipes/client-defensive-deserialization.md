# Recipe: defensive deserialization (trust the contract, verify the payload)

Cross-platform: Kotlin Multiplatform, Flutter, React Native.

## Problem

The contract promises a shape. The network delivers whatever it delivers. A backend bug, a
truncated response, a proxy that helpfully injects HTML, an enum value nobody told the client
about — any of these will happily deserialize into a half-valid object that explodes three
screens later, far from the cause. "Zero trust in the backend" means the crash, if there is
one, happens at the boundary, as a typed error, not deep in the UI as a null-pointer.

## Concept

Parsing is validation. Each raw field is checked — present, right type, a known enum, a
parseable date, a satisfied domain invariant — and anything that fails becomes a single typed
`MalformedResponse`, never an exception that escapes the data layer. Unknown fields are
ignored (forward compatibility); missing required fields are fatal (correctness).

## Implementation ×3

**KMP** — `data/mapper/Mappers.kt` (DTOs are `@Serializable`, `ignoreUnknownKeys = true`)

```kotlin
private fun EventDto.toDomain(): Event = Event(
    id = EventId(id),
    status = when (status) {
        "on_sale" -> EventStatus.ON_SALE
        "sold_out" -> EventStatus.SOLD_OUT
        else -> throw MappingException("unknown event status '$status'")
    },
    startsAt = parseInstant(startsAt), // throws MappingException on a bad timestamp
    // …
)
```

The executor catches `MappingException` (and any deserialization failure) and returns
`Outcome.Failure(AppError.MalformedResponse(...))`.

**Flutter** — `lib/data/mappers.dart`

```dart
EventStatus _eventStatus(String raw) => switch (raw) {
      'on_sale' => EventStatus.onSale,
      'sold_out' => EventStatus.soldOut,
      _ => throw MappingError("unknown event status '$raw'"),
    };
```

Typed accessors (`_str`, `_int`, `_date`) throw `MappingError` on a missing/wrong field; the
executor maps it to `MalformedResponse`.

**React Native** — `src/data/mappers.ts`

```ts
function str(json: Json, key: string): string {
  const v = json[key];
  if (typeof v === 'string') return v;
  throw new MappingError(`missing or non-string field '${key}'`);
}
// mapEnum(...) throws on an unknown value; date(...) throws on an unparseable one
```

## Comparison

- **KMP** leans on `kotlinx.serialization` for the wire→DTO step (`ignoreUnknownKeys`) and adds
  a hand-written DTO→domain map for the semantic checks (enums, invariants). Two steps, each
  doing one job.
- **Flutter** and **React Native** parse straight from the decoded map/JSON with explicit typed
  accessors — no codegen, every field checked by hand. More boilerplate, nothing hidden.
- All three converge on the same guarantee: a bad payload is one `MalformedResponse`, and the
  app keeps running.

## How to see it work

The tests are the demo. Each app feeds its parser a payload with an unknown enum, an
unparseable timestamp, a missing field, and a sold-out sector whose available exceeds total —
and asserts `MalformedResponse` (KMP drives it through Ktor's `MockEngine`;
Flutter/React Native call the mappers directly). Unknown extra fields are asserted to be
ignored.

## Trace it to the tests

- KMP — `apps/kmp/sharedUI/src/commonTest/.../data/HttpRepositoriesTest.kt`
- Flutter — `apps/flutter/test/mappers_test.dart`
- React Native — `apps/react-native/src/data/mappers.test.ts`

## Trade-offs

Hand-written mapping is verbose and, yes, the sort of code a generator could emit — which is
exactly the point of the contract-codegen path (documented in `shared/contract`). Generated
models remove the boilerplate but not the need for the semantic checks; you still validate
enums, dates and invariants somewhere. Doing it by hand here keeps the failure behaviour
obvious and the excerpt short.
