# Recipe: circuit breaker, retry, and timeout on the payment path (Go)

## 1. Problem

Payment goes through an external provider, and external providers have bad days. If the
provider gets slow, every payment worker blocks on it and the backlog grows until the
whole system is wedged. If it starts rejecting, naive retries pile more load onto
something already on fire. A ticketing sale cannot take the rest of the system down
because one downstream dependency degraded.

## 2. Concept

Three cooperating patterns, each doing one job:

- **Timeout** — never wait forever. A slow provider becomes a fast failure.
- **Retry with backoff + jitter** — a transient blip should not lose the order; retry a
  few times, spaced out, with jitter so retries do not synchronise into a thundering
  herd.
- **Circuit breaker** — after repeated failures, stop calling for a while. Fail fast
  instead of hammering a dead dependency, and give it room to recover.

Together they produce **graceful degradation**: when payment is down, order creation
still returns `202`, the order simply stays `pending`, and it settles once the provider
recovers. Nothing is lost, nothing crashes, no 5xx reaches the buyer.

## 3. Implementation

- **Timeout** — the gateway client has a hard 4s deadline
  (`backends/go/internal/adapter/paymentgw/paymentgw.go`).
- **Retry** — the worker retries three times with exponential backoff + jitter
  (`cmd/server/main.go`, `paymentWorker`).
- **Circuit breaker** — `internal/adapter/paymentgw/breaker.go`, a hand-rolled
  three-state machine wrapping the gateway:

```go
func (g *BreakerGateway) Charge(ctx context.Context, orderID string) (string, error) {
    if !g.breaker.allow() {
        return "", domain.ErrLockUnavailable // OPEN: fast-fail, do not even try
    }
    ref, err := g.inner.Charge(ctx, orderID)
    if err != nil { g.breaker.failure(); return "", err }
    g.breaker.success(); return ref, nil
}
```

It trips OPEN after 5 consecutive failures, fast-fails for a 10s cooldown, then goes
HALF-OPEN and lets one trial through (success closes it, failure re-opens it). Wired in
`main.go`: `paymentgw.NewBreakerGateway(paymentgw.New(url), 5, 10*time.Second)`.

## 4. How to see it working

The fake gateway has a runtime failure switch. Unit-test the state machine, then watch
it live:

```bash
go test ./internal/adapter/paymentgw/ -run TestBreaker -v   # the transitions, deterministically

# live: flip the provider to reject charges, then recover
curl -s -XPOST localhost:9090/admin/failure-mode -d '{"mode":"fail"}'
#   create an order -> POST /orders returns 202, but the order stays `pending`
#   backend logs: "payment worker: giving up on order after retries: payment gateway returned 502"
curl -s -XPOST localhost:9090/admin/failure-mode -d '{"mode":"ok"}'
#   a new order settles to `paid` again
```

`mode: timeout` instead makes `/charges` hang past the 4s client timeout, exercising the
timeout path; after enough timeouts the breaker opens and calls return instantly.

## 5. Trade-offs

- **A breaker trades freshness for stability.** While OPEN it fast-fails calls that
  *might* have succeeded (the provider may have recovered a second ago). The HALF-OPEN
  trial bounds that staleness to the cooldown.
- **Thresholds are guesses.** 5 failures / 10s suits a demo; real tuning needs the
  provider's actual failure signature. Too sensitive and you trip on noise; too lax and
  you hammer a dead dependency.
- **Only the Go reference backend has the breaker.** The others have timeout + retry;
  adding a breaker to all seven is left as an exercise, since the pattern is identical
  and lives entirely in the gateway adapter.
