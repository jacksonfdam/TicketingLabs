# Observability

Prometheus + Grafana, opt-in behind the `observability` compose profile. The design
choice worth noting: metrics are collected **at the gateway**, not inside each backend.
Traefik already sees every request, so it can emit RED metrics (Rate, Errors, Duration)
per router and per service — and because that happens at the edge, the exact same
dashboard works for all seven backends with zero per-backend instrumentation. Swap the
active backend and the graphs keep working.

## Run it

```bash
COMPOSE_PROFILES=go,observability make up     # any backend + the observability stack
```

- Grafana: http://localhost:3001 (anonymous viewer enabled for the demo; admin login
  `admin` / `admin_local_dev_only`). The dashboard **Ticketing Labs — RED (per endpoint)**
  is provisioned automatically.
- Prometheus: http://localhost:9091

Generate some traffic (click around http://localhost/ or run `make load`) and watch the
Rate and Duration panels move.

## What's on the dashboard

- **Rate** — `sum by (router) (rate(traefik_router_requests_total[1m]))`
- **Errors** — the same, filtered to `code=~"5.."`. Under normal operation this stays
  empty: the app answers sold-out with `409` and bad input with `400`/`422`, none of
  which are server errors.
- **Duration** — `histogram_quantile(0.95, ... traefik_service_request_duration_seconds_bucket ...)`

## Files

```
prometheus.yml                              scrape config (targets gateway:8082)
grafana/provisioning/datasources/           the Prometheus datasource (uid: prometheus)
grafana/provisioning/dashboards/            the dashboard provider
grafana/dashboards/red.json                 the RED dashboard
```

The gateway exposes Prometheus metrics on a dedicated `:8082` entrypoint (see
`infra/gateway/traefik.yml`), scraped in-network by Prometheus and never published to
the host.

## Not here (yet)

Distributed tracing (OpenTelemetry → Tempo/Jaeger) and log aggregation (Loki) are the
remaining observability pieces. The `X-Request-Id` that every backend already threads
through requests and error envelopes is the correlation id those would hang traces off.
