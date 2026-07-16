# Recipe: distributed tracing with OpenTelemetry (Go)

## 1. Problem

RED metrics at the gateway tell you `POST /reservations` got slow. They do not tell you
*why* — was it the Redis lock, the Postgres decrement, or the handler itself? When a
request fans out across a lock, a database, a cache, and (asynchronously) a broker, you
need to see one request's path as a whole, with timings for each hop.

## 2. Concept

A trace is a tree of spans, one per unit of work, linked by a shared trace id and
propagated through the call context. Instrument the entry point (the HTTP server) and the
interesting internal operations (the lock, the query), and a tracing backend reconstructs
the waterfall. The correlation id you already thread through requests (`X-Request-Id`) is
the human-facing handle; the trace id is the machine one.

## 3. Implementation

OpenTelemetry, opt-in via `OTEL_EXPORTER_OTLP_ENDPOINT` (empty = no-op, so the backend
runs identically without an observability stack). Setup in
`backends/go/internal/platform/tracing.go`; wiring in `cmd/server/main.go`:

```go
shutdown, _ := platform.InitTracing(ctx, "backend-go", os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
defer shutdown(context.Background())
srv.Handler = otelhttp.NewHandler(routes, "http.server") // one server span per request
```

Child spans live in the adapters (infrastructure, so importing otel is fine), started
from the request context so they nest automatically:

```go
// internal/adapter/redisadp/redisadp.go
ctx, span := otel.Tracer("redis").Start(ctx, "redis.lock.acquire"); defer span.End()
// internal/adapter/postgres/postgres.go
ctx, span := otel.Tracer("postgres").Start(ctx, "db.decrement_inventory"); defer span.End()
```

Spans export over OTLP/gRPC to Tempo (`infra/observability/tempo.yaml`), viewed in
Grafana's Tempo datasource.

## 4. How to see it working

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=tempo:4317 COMPOSE_PROFILES=go,observability make up
# do a reservation (log in, join queue, POST /reservations), then in Grafana → Explore →
# Tempo, search service.name = backend-go and open a POST trace.
```

The trace shows three nested spans:

```
POST                       (otelhttp server span)
└─ redis.lock.acquire      (the distributed lock)
└─ db.decrement_inventory  (the atomic conditional UPDATE)
```

Verified against Tempo: a `POST /reservations` trace with exactly those spans.

## 5. Trade-offs

- **Instrumentation is not free.** Every span is CPU, memory, and export bandwidth. In
  production you sample (head or tail) — typically via an OpenTelemetry Collector between
  the app and Tempo, which is the layer this lab omits for simplicity.
- **Only the Go backend is instrumented.** The pattern ports directly (an `otelhttp`
  wrap plus a couple of adapter spans), but the other six are left uninstrumented so the
  recipe stays the reference rather than seven near-copies.
- **Spans in adapters, not the domain.** Keeping otel out of `usecase`/`domain` preserves
  the framework-free core; the trade is that a purely in-domain computation would not get
  its own span without threading a tracing port through, which was not worth it here.
