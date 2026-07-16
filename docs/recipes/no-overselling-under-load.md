# Recipe: proving no overselling under load

## 1. Problem

Every backend in this lab *claims* it cannot oversell. A unit test with fake adapters
argues it; the Go and TypeScript tests even fire hundreds of goroutines/promises at an
in-memory store. But the PHP backends are single-threaded per process, so their unit
tests are sequential and prove nothing about concurrency. And an in-memory fake is not
Postgres. The only honest proof is real HTTP requests racing against real infrastructure.

## 2. Concept

Point a load generator at the reservation endpoint with far more concurrent buyers than
there are seats, and check the arithmetic afterwards. If the invariant holds, the number
of successful holds equals the capacity exactly — no more (overselling), and, since
everyone is trying, no fewer. Everything else is a clean rejection, not a server error.

The safety itself comes from two layers the recipes cover elsewhere: a distributed lock
that serialises writers per sector, and — the real guarantee — a single atomic
conditional `UPDATE` (`... WHERE available_inventory >= qty`) backstopped by a
`CHECK (available_inventory >= 0)` constraint. The load test does not add safety; it
*falsifies* the claim if the safety is wrong.

## 3. Implementation

`infra/load/reserve-stampede.js` — a k6 scenario. 50 virtual users, 400 shared
iterations against a 100-seat sector, each with a unique `Idempotency-Key`:

```js
export const options = {
  scenarios: { stampede: { executor: 'shared-iterations', vus: 50, iterations: 400 } },
  thresholds: { reservations_created: ['count<=100'] }, // fails the run on a 101st seat
};
export default function (data) {
  const res = http.post(`${BASE}/reservations`,
    JSON.stringify({ sector_id: SECTOR, quantity: 1 }),
    { headers: { Authorization: `Bearer ${data.token}`, 'Idempotency-Key': `k6-${__VU}-${__ITER}` } });
  if (res.status === 201) created.add(1);
}
```

It hits the backend directly (`http://backend:8080`), bypassing the gateway's edge
rate-limiter so the backend's own locking is what is measured.

## 4. How to see it working

```bash
COMPOSE_PROFILES=go make up      # or fastapi | nest | express | laravel | symfony | phalcon
make load
```

k6 prints `reservations_created ... count=100` and the threshold passes. Then the data
layer confirms it:

```
vip_available=0
vip_held=100
negative_inventory_rows=0
```

Swap `COMPOSE_PROFILES` and run again: the same 100/300 split holds for every backend.
Verified on Go and on Phalcon (PHP C extension) — 100 of 100 sold, 0 over-sold, 0 5xx.

## 5. Trade-offs

- **A load test proves presence of a bug, not its absence.** 400 attempts passing does
  not mathematically guarantee safety; it makes a regression very likely to show up.
  The atomic `UPDATE` and the `CHECK` constraint are what make it *correct*; the load
  test is what makes you *believe* it.
- **Targeting the backend directly** skips the edge rate-limiter, which in production is
  a real and desirable line of defence (it sheds the stampede before it reaches the
  app). We bypass it here on purpose to test the layer underneath; a separate run
  through the gateway would show the rate-limiter doing its job with 429s.
- **One buyer, many keys** keeps the harness simple. It still exercises the sector lock
  and the atomic decrement fully, because those are global to the sector, not per user.
