# Recipe: a distributed lock in Redis

## 1. Problem

The backend runs as several stateless replicas (see the scale recipe). An in-process
mutex only serialises goroutines within one replica; it does nothing about two replicas
touching the same sector at the same instant. You need a mutual exclusion that spans
processes.

## 2. Concept

A lock is a key that only one holder can own at a time, living in a store everyone
shares — Redis. Acquire = `SET key token NX PX ttl`: set it only if absent (`NX`), with a
value unique to you (`token`) and an expiry (`PX`) so a crashed holder cannot wedge the
lock forever. Release = delete the key, but only if the value is still yours — checked
atomically in a Lua script, so you never delete a lock that already expired and was
re-acquired by someone else.

Crucially, in this lab the lock is **not** the correctness guarantee for inventory — the
atomic conditional `UPDATE` is (see the overselling recipe). The lock is contention
management: it serialises writers for one sector so they stop wasting work racing, and it
closes the check-then-insert window on idempotency.

## 3. Implementation

`backends/go/internal/adapter/redisadp/redisadp.go`:

```go
ok, _ := c.rdb.SetNX(ctx, "lock:"+key, token, c.lockTTL).Result() // SET NX PX
// ... on release, delete only if we still own it:
var releaseScript = redis.NewScript(`
if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`)
```

The reservation use case takes the lock per sector, does the atomic decrement, then
releases it in a `defer` (`internal/usecase/reservation.go`). Every backend implements
the same `SET NX` + token-checked-delete pattern (predis in the PHP backends, ioredis in
the TypeScript ones).

## 4. How to see it working

The lock shows up as a span in a reservation trace (`redis.lock.acquire`, see the tracing
recipe), and its correctness under contention is what the load test proves: `make load`
with `--scale backend-go=3` still sells exactly 100 seats, because three replicas
coordinate through this one lock plus the atomic `UPDATE`.

## 5. Trade-offs

- **A single-node Redis lock is not bulletproof.** Under a Redis failover a lock can be
  lost (the Redlock discussion is the rabbit hole here). For this domain it is acceptable
  because the database's atomic `UPDATE` + `CHECK` is the real backstop; the lock is an
  optimisation, not the guarantee. Do not use a single-node lock as your *only* line of
  defence for money.
- **Lock TTL is a guess.** Too short and it expires mid-operation; too long and a crashed
  holder blocks others until it lapses. 15s here comfortably exceeds a reservation write.
- **Per-sector locking caps per-sector throughput** — everyone buying the same sector
  queues on one key. That is the point (it prevents the race), but it means the hot
  sector is the bottleneck, not the app replicas.
