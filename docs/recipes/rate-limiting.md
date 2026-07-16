# Recipe: rate limiting (two layers)

## 1. Problem

A sale opening is indistinguishable from a denial-of-service attack: a huge burst of
requests, some from real buyers, some from scripts trying to grab stock. Left unchecked,
the burst either knocks the service over or lets a bot monopolise the queue. You want to
shed and slow abusive traffic without penalising normal use.

## 2. Concept

Limit at two layers, because they defend different things:

- **Edge rate limiting** (the gateway) — coarse, per-client, protects the whole system.
  It sheds a flood before it reaches any backend, so a stampede cannot exhaust
  connections or CPU downstream.
- **Application rate limiting** (per user, per action) — fine-grained, protects a
  specific resource. Here: how often one user may join a queue, so a script cannot spam
  the waiting-room endpoint.

Both are counters over a time window; the difference is the key (IP/connection at the
edge, `user:action` in the app) and what they protect.

## 3. Implementation

**Edge** — Traefik middleware (`infra/gateway/dynamic.yml`):

```yaml
edge-rate-limit:
  rateLimit:
    average: 50
    burst: 100
```

**Application** — a Redis fixed-window counter (`backends/go/internal/adapter/redisadp/redisadp.go`),
used by the queue use case to cap joins at 5/minute per user+event:

```go
count, _ := c.rdb.Incr(ctx, "ratelimit:"+key).Result()
if count == 1 { c.rdb.Expire(ctx, "ratelimit:"+key, window) } // window TTL on first hit
return count <= int64(limit), nil
```

`QueueService.Join` (`internal/usecase/queue.go`) returns `429 rate_limited` when the
limit is exceeded.

## 4. How to see it working

```bash
# hammer the queue-join for one user; after 5 in a minute it returns 429
for i in $(seq 1 8); do
  curl -sk -o /dev/null -w "%{http_code} " -XPOST https://localhost/api/events/$EVENT/queue -H "Authorization: Bearer $TOKEN"
done   # 201 201 201 201 201 429 429 429
```

The load test also shows the edge limiter in action if you target the gateway instead of
the backend directly — the stampede gets a wall of `429`s at the edge (which is exactly
why the overselling test targets the backend directly, to measure the layer underneath).

## 5. Trade-offs

- **Fixed windows have an edge burst.** Two windows' worth of requests can land across a
  boundary (end of one window + start of the next). A sliding window or token bucket
  smooths this; the fixed window is chosen for being obvious and cheap.
- **The app limiter fails open.** If Redis is unreachable, `Allow` returns true rather
  than locking every user out over an infra blip — a deliberate availability-over-strictness
  choice, documented at the call site.
- **Edge limiting by IP is crude.** NATs and proxies share IPs, so a per-IP limit can
  punish many users behind one address. Real deployments key on something better (API
  key, authenticated user) once identity is known.
