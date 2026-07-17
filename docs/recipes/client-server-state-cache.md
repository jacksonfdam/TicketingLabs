# Recipe: caching server state, and knowing when to throw it away

Cross-platform: Kotlin Multiplatform, Flutter, React Native.

## Problem

The events list does not change second to second, so refetching it on every glance is waste —
a spinner the user didn't need and a request the server didn't want. But it does change the
instant someone reserves a seat, so caching it forever is a lie: the app shows availability
that is already gone. Caching is easy; invalidation is the whole job.

## Concept

Cache reads for a short TTL that matches the server's own `Cache-Control: max-age=30`, so a
pull-to-refresh inside the window is instant and shows no spinner. Then invalidate explicitly
on the one event that changes availability — a reservation. Cache only successes; never
remember a failure.

## Implementation ×3

**KMP** — a read-through decorator, `data/cache/CachingEventRepository.kt`, wrapping the real
repository. The time source is injected so the TTL is testable without waiting:

```kotlin
override suspend fun listEvents(cursor: String?, limit: Int?): Outcome<EventPage> {
    if (cursor == null) pageEntry?.let { if (it.mark.elapsedNow() < ttl) return Outcome.Success(it.value) }
    val result = delegate.listEvents(cursor, limit)
    if (cursor == null && result is Outcome.Success) pageEntry = Entry(result.value, timeSource.markNow())
    return result
}
fun invalidate() { pageEntry = null; detailEntries.clear() }
```

The app shell calls `invalidate()` when a reservation succeeds.

**Flutter** — the same decorator, `lib/data/cache.dart`, with an injected `DateTime Function()`
clock; the app calls `invalidate()` in the reserve handler.

**React Native** — TanStack Query is the cache. Reads set a `staleTime`, and the reserve
handler invalidates:

```ts
useQuery({ queryKey: ['events'], queryFn: …, staleTime: 30000 }); // 30s, matches the server
// on reserve:
queryClient.invalidateQueries({ queryKey: ['events'] });
queryClient.invalidateQueries({ queryKey: ['event'] });
```

## Comparison

KMP and Flutter hand-roll a tiny read-through decorator behind the repository port — a dozen
lines, fully in the app's control, and unit-tested with an injected clock. React Native gets
caching, background refetch, and invalidation from TanStack Query for free, at the cost of a
dependency and its query-key discipline. Same two ideas everywhere: a TTL, and an explicit
invalidation keyed to the mutation that changes the data.

## How to see it work

The decorators are unit-tested (KMP and Flutter): a second read inside the TTL serves from
cache (the delegate is called once), a read after the TTL refetches, and `invalidate()` forces
a refetch. In all three apps, reserving a seat drops the events/detail cache so the next view
reflects the new availability.

## Trade-offs

A 30-second TTL is a guess that matches the server's header; too long and availability goes
stale between invalidations, too short and the cache barely helps. Explicit invalidation is
precise but manual — you have to remember every mutation that changes cached data (here, only
the reservation). TanStack Query automates more (stale-while-revalidate, refetch on focus) but
is a library to learn; the hand-rolled decorator is transparent but does exactly and only what
it says.
