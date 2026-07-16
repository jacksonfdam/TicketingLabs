# Observability

The three pillars — metrics, traces, logs — opt-in behind the `observability` compose
profile: Prometheus + Grafana (metrics), Tempo (traces), Loki + Promtail (logs).

Metrics are collected **at the gateway**, not inside each backend. Traefik already sees
every request, so it emits RED metrics (Rate, Errors, Duration) per router and service —
the same dashboard works for all seven backends with zero per-backend instrumentation.

Traces are the complement RED cannot give: the *inside* of one request. The Go backend
is instrumented with OpenTelemetry (opt-in via `OTEL_EXPORTER_OTLP_ENDPOINT`) and exports
spans to Tempo, so a single reservation shows as `POST` → `redis.lock.acquire` →
`db.decrement_inventory` — the lock and the atomic decrement, right there in the waterfall.

Logs from every container are shipped to Loki by Promtail and queryable in Grafana beside
the metrics and traces.

## Run it

```bash
# tracing is opt-in via the OTLP endpoint; set it to point the Go backend at Tempo:
OTEL_EXPORTER_OTLP_ENDPOINT=tempo:4317 COMPOSE_PROFILES=go,observability make up
```

- Grafana: http://localhost:3001 (anonymous viewer enabled for the demo; admin login
  `admin` / `admin_local_dev_only`). Datasources **Prometheus**, **Tempo**, and **Loki**
  are provisioned, plus the dashboard **Ticketing Labs — RED (per endpoint)**.
- Prometheus: http://localhost:9091

Generate traffic (click around http://localhost/ or run `make load`), then in Grafana:
Explore the RED dashboard (metrics), search Tempo for a `POST` trace (traces), and query
`{container="ticketing-labs-backend-go-1"}` in Loki (logs).

## What's on the dashboard

- **Rate** — `sum by (router) (rate(traefik_router_requests_total[1m]))`
- **Errors** — the same, filtered to `code=~"5.."`. Under normal operation this stays
  empty: the app answers sold-out with `409` and bad input with `400`/`422`, none of
  which are server errors.
- **Duration** — `histogram_quantile(0.95, ... traefik_service_request_duration_seconds_bucket ...)`

## Files

```
prometheus.yml                     scrape config (targets gateway:8082)
tempo.yaml                         Tempo: OTLP receiver + local trace storage
promtail-config.yaml               Promtail: ship all container logs to Loki
grafana/provisioning/datasources/  Prometheus, Tempo, Loki datasources
grafana/provisioning/dashboards/   the dashboard provider
grafana/dashboards/red.json        the RED dashboard
```

The gateway exposes Prometheus metrics on a dedicated `:8082` entrypoint (see
`infra/gateway/traefik.yml`), scraped in-network by Prometheus and never published to
the host. Only the Go reference backend is trace-instrumented so far; adding OTel to the
other six is the same `otelhttp` wrap plus a couple of adapter spans.

## Scope

Metrics cover all seven backends (collected at the edge). Tracing is wired for the Go
backend; Loki captures every container's logs. A production setup would add trace
sampling (via an OpenTelemetry Collector between the app and Tempo) and object storage
for Tempo/Loki rather than the local filesystem used here.
