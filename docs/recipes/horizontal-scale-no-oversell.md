# Recipe: horizontal scale without overselling

## 1. Problem

One backend instance can only serve so many requests, and a sale's whole problem is a
traffic spike. The obvious fix is to run more instances behind a load balancer. But the
moment there are two instances, the "don't oversell" logic has to work *across* them: two
processes must not each sell the last seat because neither saw the other's write. An
in-process mutex is now useless.

## 2. Concept

Keep the instances **stateless** and push all shared state to services they both talk to.
Then correctness is enforced centrally, not per instance:

- the **atomic conditional `UPDATE`** (`... WHERE available_inventory >= qty`) is a single
  statement in one Postgres, so concurrent writers from any instance serialise on the row;
- the **distributed lock** lives in Redis, so it is a lock *between processes*, not within
  one.

Because no correctness lives in the instance, adding instances only adds throughput. The
load balancer (Traefik locally, a Service + Ingress in Kubernetes) spreads requests; the
datastores keep everyone honest.

## 3. Implementation

Nothing new to write — this is a property of the earlier design, now exercised at scale.
Locally, Docker Compose scales the active backend and Docker's DNS round-robins the
`backend` alias across replicas:

```bash
COMPOSE_PROFILES=go docker compose up -d --scale backend-go=3
```

In Kubernetes it is a `replicas: 3` Deployment behind a Service, with an HPA scaling on
CPU (`infra/k8s/20-backend.yaml`).

## 4. How to see it working

```bash
COMPOSE_PROFILES=go docker compose up -d --scale backend-go=3
make load
```

Result: 100 of 100 seats sold, 400 attempts rejected with `409`, 0 over-sold, 0 5xx —
identical to the single-instance run. Confirm all three replicas actually served and
coordinated:

```sql
-- three distinct backend client addresses held connections to Postgres:
SELECT count(DISTINCT client_addr) FROM pg_stat_activity WHERE usename = 'ticketing_app';  -- 3
-- and the invariant held:
SELECT available_inventory FROM sectors WHERE name = 'Camarote VIP';  -- 0, never negative
```

Verified: 3 replicas, one shared Postgres and Redis, exactly 100 sold.

## 5. Trade-offs

- **The datastores are now the scaling ceiling.** Statelessness moved the bottleneck to
  Postgres/Redis. Past a point you scale *them* — read replicas, connection pooling
  (both noted in the perf checklist), Redis clustering — not just the app.
- **Per-sector lock contention caps per-sector write throughput** no matter how many app
  replicas you run; everyone still queues on that one row/lock. That is correct (it is
  what prevents overselling) but it means adding replicas speeds up *reads* and *other
  sectors* more than it speeds up a single hot sector.
- **Local DNS round-robin is not production load balancing.** It is good enough to prove
  cross-instance coordination; a real deployment uses the Ingress/Service (k8s) or the
  gateway's Docker provider, which health-check and balance properly.
