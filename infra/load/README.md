# Load testing

One [k6](https://k6.io) scenario, `reserve-stampede.js`, that reproduces the moment a
popular sale opens: far more concurrent buyers than there are seats, all hammering the
same sector at once. Its whole job is to try to make the backend oversell, and to prove
it cannot.

## What it asserts

- **No overselling.** With a 100-seat sector and 400 concurrent reservation attempts,
  exactly 100 succeed (`201`) and the other 300 are cleanly rejected (`409
  inventory_exhausted`). The k6 threshold `reservations_created: count<=100` fails the
  run if a 101st seat is ever sold.
- **No 5xx under contention.** Over-contention is a business outcome (409), not a
  server error. The `no 5xx` check must stay at 100%.

It targets the backend **directly** (`http://backend:8080`), not the gateway, so the
edge rate-limiter does not mask the backend's own concurrency control — the distributed
lock plus the atomic conditional `UPDATE`, which is the part that actually prevents
overselling and the part that differs across the seven backends.

## Run it

Bring up any backend (`COMPOSE_PROFILES=<backend> make up`), then:

```bash
make load
```

`make load` resets the sectors to full stock, clears prior reservations, and runs the
stampede against whichever backend currently holds the `backend` alias. To confirm the
data layer afterwards:

```bash
make db-shell
# available_inventory should be 0, and no row is ever negative:
SELECT name, available_inventory FROM sectors;
SELECT count(*) FROM reservations WHERE status = 'held';
```

## Verified

Run against **Go** and **Phalcon** (a PHP C extension): both sold exactly 100 of 100
seats under 400 concurrent attempts, 0 over-sold, 0 5xx, and Postgres never held a
negative inventory. The PHP result matters most — its unit tests are only sequential, so
this is the first proof its lock + atomic decrement hold under genuine concurrency.

## Tuning

Environment overrides: `-e VUS=` (concurrent workers), `-e ITERS=` (total attempts),
`-e SEATS=` (expected capacity for the threshold), `-e SECTOR=` / `-e EVENT=`,
`-e TARGET=`. Example: a nastier run —

```bash
docker run --rm --network ticketing-labs_default -v "$PWD/infra/load":/s \
  -e TARGET=http://backend:8080 -e VUS=100 -e ITERS=2000 grafana/k6 run /s/reserve-stampede.js
```
