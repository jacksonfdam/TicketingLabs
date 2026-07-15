# Recipe: idempotent, oversell-proof reservations in Go

## 1. Problem

A concert goes on sale. Ten thousand people want the hundred VIP seats, and a good
number of them double-click the buy button because the page felt slow. Two failures
are lurking:

- **Overselling.** Two requests read "1 seat left" at the same instant, both decide
  they can have it, and both succeed. You have now sold the same seat twice and one
  customer is going to be very disappointed at the door.
- **Double charging.** A user's double-click creates two reservations and two orders.
  You take their money twice. They notice.

Both are concurrency bugs, and both are unacceptable when real money and real seats
are involved.

## 2. Concept

Three ideas, stacked:

- **Idempotency key.** The client sends a unique `Idempotency-Key` per intent.
  Re-sending the same key returns the original result instead of doing the work again.
  A double-click becomes a no-op.
- **Distributed lock.** A short-lived lock, held in Redis, serialises writers for one
  sector so they stop racing. It manages contention. It is not, by itself, the
  correctness guarantee.
- **Atomic conditional decrement.** A single SQL `UPDATE` that subtracts stock only if
  enough remains. This is the actual guarantee. Even with every lock removed, the
  database refuses to let inventory go negative.

Belt, braces, and a database constraint. If any one of them fails, the next still
holds the line.

## 3. Implementation

The orchestration lives in the framework-free use case,
`backends/go/internal/usecase/reservation.go`:

```go
// (1) Idempotency fast path: same key, return the original hold.
if prior, err := s.reservations.FindByIdempotencyKey(ctx, userID, idemKey); err == nil && prior != nil {
    return &CreateResult{Reservation: prior, Replayed: true}, nil
}
// (2) Checkout gate: no admitted queue token, no entry.
if !s.admission.IsAdmitted(ctx, userID, sector.EventID) { return nil, domain.ErrNotAdmitted }
// (3) Distributed lock on the sector (contention management).
release, ok, err := s.locker.Acquire(ctx, "sector:"+sectorID, s.lockWait)
...
defer release()
// (4) Atomic conditional decrement (the real guarantee).
decremented, err := s.sectors.DecrementInventory(ctx, sectorID, qty)
if !decremented { return nil, domain.ErrInventoryExhausted }
// (5) Create the hold with a TTL.
```

The decrement itself is one statement, in `internal/adapter/postgres/postgres.go`:

```sql
UPDATE sectors SET available_inventory = available_inventory - $2
 WHERE id = $1 AND available_inventory >= $2
```

`RowsAffected() == 1` means it worked; `0` means there was not enough. No read, no
race. And the schema has the final say (`contract/db/migrations/0001_init.sql`):

```sql
available_inventory INTEGER NOT NULL CHECK (available_inventory >= 0)
```

## 4. How to see it working

The overselling proof is a unit test. It fires 500 concurrent buyers at 100 tickets
and asserts exactly 100 succeed:

```bash
cd backends/go
go test ./internal/usecase/ -run TestNoOversellingUnderConcurrency -race -v
```

Idempotency, end to end against the running stack:

```bash
# same Idempotency-Key twice: first 201, second 200, same reservation id
curl -sk -XPOST https://localhost/api/reservations \
  -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: demo-1' \
  -H 'Content-Type: application/json' \
  -d '{"sector_id":"33333333-3333-3333-3333-333333333333","quantity":2}'
```

## 5. Trade-offs

- **The lock costs throughput.** Serialising writers per sector means buyers for the
  same sector queue behind each other. That is the point under contention, but it caps
  per-sector write throughput. If you locked per-sector on a low-contention system,
  you would be paying for a problem you do not have. The atomic decrement alone would
  suffice there; the lock is worth it precisely when everyone wants the same seats.
- **Idempotency keys need storage and a lifetime.** Here the key is a unique column on
  the reservation, so it lives as long as the reservation. A busier system would
  expire keys deliberately rather than keep them forever.
- **Redis is now on the critical path.** The lock and rate limiter depend on it. We
  fail open on rate-limiter errors, but a Redis outage degrades reservation
  throughput. That is a deliberate, documented dependency, not an accident.
