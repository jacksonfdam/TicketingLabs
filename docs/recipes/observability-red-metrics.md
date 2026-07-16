# Recipe: RED metrics at the gateway

## 1. Problem

Seven backends in five languages. Instrumenting each one for metrics means seven
different client libraries, seven ways to name a counter, and seven chances to measure
the same thing slightly differently — and then the dashboards only work if every backend
was instrumented identically. For a lab whose whole point is that the backends are
interchangeable, per-backend metrics undercut the premise.

## 2. Concept

Measure where every request already passes through: the gateway. RED — **R**ate,
**E**rrors, **D**uration — is the standard trio for a request-driven service, and a
reverse proxy sees all three for free. Collecting at the edge means one metrics
pipeline, one dashboard, and identical measurements no matter which backend is behind
the alias. It is also honest about what the *user* experiences, since it measures at the
door they knock on.

The trade-off: edge metrics see HTTP, not internals. They will tell you `/reservations`
got slow; they will not tell you it was the Redis lock versus the Postgres decrement.
For that you add tracing (the `X-Request-Id` threaded through every backend is the hook).

## 3. Implementation

Traefik emits Prometheus metrics with per-router and per-service labels
(`infra/gateway/traefik.yml`):

```yaml
metrics:
  prometheus:
    entryPoint: metrics          # a dedicated :8082, scraped in-network
    addRoutersLabels: true
    addServicesLabels: true
```

Prometheus scrapes it (`infra/observability/prometheus.yml`), and Grafana renders a
provisioned RED dashboard (`grafana/dashboards/red.json`):

```promql
# Rate
sum by (router) (rate(traefik_router_requests_total[1m]))
# Errors (5xx only)
sum by (router) (rate(traefik_router_requests_total{code=~"5.."}[1m]))
# Duration (p95)
histogram_quantile(0.95, sum by (le, service) (rate(traefik_service_request_duration_seconds_bucket[5m])))
```

## 4. How to see it working

```bash
COMPOSE_PROFILES=go,observability make up
make load                      # or click around http://localhost/
open http://localhost:3001     # Grafana, dashboard "Ticketing Labs — RED (per endpoint)"
```

The Rate panel tracks `api@file`, Duration shows the active backend's p95, and Errors
stays empty — because sold-out is a `409` and bad input is `400`/`422`, never a `5xx`.
Switch `COMPOSE_PROFILES` to another backend and the same dashboard keeps working.

## 5. Trade-offs

- **Edge-only is a starting point, not the whole story.** It cannot attribute latency to
  an internal component. Distributed tracing (OpenTelemetry) is the next layer and is
  noted as not-yet-built in `infra/observability`.
- **Traefik's histogram buckets are fixed defaults.** If you care about a specific SLO
  boundary you may need to configure buckets so the p-quantile lands where you measure.
- **One dashboard for all backends is a feature and a limitation.** It proves parity
  cheaply, but it will not surface a backend-specific internal regression that does not
  change the HTTP-visible behaviour.
