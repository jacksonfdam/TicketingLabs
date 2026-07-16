# Kubernetes manifests

The production path for the app tier: what `docker-compose.yml` does locally, expressed
as Kubernetes objects. These are the equivalent of the Compose backend + frontend +
gateway, and they lean on the same property that makes the whole lab work — the backends
are stateless, so they scale horizontally and the shared Postgres + Redis do the
coordinating.

## What's here

| File | Objects |
|---|---|
| `00-namespace.yaml` | `ticketing` namespace |
| `10-config.yaml` | `ConfigMap` (non-secret env) + `Secret` (DB URL, JWT, webhook secret) |
| `20-backend.yaml` | backend `Deployment` (3 replicas, liveness `/health` + readiness `/ready` probes, resource requests/limits) + `Service` + `HorizontalPodAutoscaler` (CPU 70%, 3–10) |
| `30-frontend.yaml` | SPA `Deployment` + `Service` |
| `40-ingress.yaml` | `Ingress`: `/api` → backend (prefix stripped), everything else → SPA |

All nine resources validate against the Kubernetes 1.34 schemas (`kubeconform -strict`).

## What's not here (on purpose)

The stateful dependencies — Postgres, Redis, RabbitMQ — are **not** modelled as
manifests. In production those are managed services or operator-run StatefulSets with
their own backup/HA story; hand-rolled single-Pod versions would teach the wrong lesson.
The `ConfigMap`/`Secret` point at the service names (`postgres`, `redis`, `broker`) you
would wire to whatever provides them.

## Deploy sketch

```bash
# build and push the images your registry expects, e.g.
docker build -t <registry>/ticketing-labs-backend-go:latest backends/go && docker push …
docker build -t <registry>/ticketing-labs-frontend:latest frontend && docker push …
# (edit the image: fields in 20-backend.yaml / 30-frontend.yaml to match)

kubectl apply -f infra/k8s/
kubectl -n ticketing rollout status deploy/backend
```

Swap the backend by pointing `20-backend.yaml`'s `image:` at any of the seven — the
Service, HPA, probes, Ingress, and the SPA are identical. Same premise as the Compose
profiles, one layer up.

## Why horizontal scale is safe here

The backend is stateless: no session affinity, no in-process state that another replica
needs. Every replica shares one Postgres and one Redis, so the reservation invariant is
enforced centrally — the atomic conditional `UPDATE` and the Redis distributed lock. The
load test proves it: run the Compose stack with `--scale backend-go=3` and the stampede
still sells exactly 100 of 100 seats, with all three replicas serving. Scaling out adds
throughput without adding a way to oversell.
