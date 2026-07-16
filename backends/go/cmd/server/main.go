// Command server wires the concrete adapters into the use cases and serves the API.
// This file is the composition root: the one place allowed to know about Postgres,
// Redis, and RabbitMQ all at once. Everything it constructs depends only on ports.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/ticketing-labs/backend-go/internal/adapter/broker"
	"github.com/ticketing-labs/backend-go/internal/adapter/paymentgw"
	"github.com/ticketing-labs/backend-go/internal/adapter/postgres"
	"github.com/ticketing-labs/backend-go/internal/adapter/redisadp"
	"github.com/ticketing-labs/backend-go/internal/config"
	"github.com/ticketing-labs/backend-go/internal/platform"
	httptransport "github.com/ticketing-labs/backend-go/internal/transport/http"
	"github.com/ticketing-labs/backend-go/internal/usecase"
)

func main() {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Distributed tracing (opt-in via OTEL_EXPORTER_OTLP_ENDPOINT). No endpoint, no-op.
	shutdownTracing, err := platform.InitTracing(ctx, "backend-go", os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	if err != nil {
		log.Printf("tracing: %v", err)
	}
	defer func() { _ = shutdownTracing(context.Background()) }()

	// --- infrastructure ---
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()

	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis url: %v", err)
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()
	redisClient := redisadp.New(rdb)

	bkr, err := broker.Connect(cfg.BrokerURL)
	if err != nil {
		log.Fatalf("broker: %v", err)
	}
	defer bkr.Close()

	// The gateway client has a hard timeout; wrap it in a circuit breaker so a provider
	// outage trips OPEN after 5 consecutive failures and fast-fails for 10s rather than
	// hammering it. Retry-with-backoff lives in the payment worker below.
	gateway := paymentgw.NewBreakerGateway(paymentgw.New(cfg.PaymentGatewayURL), 5, 10*time.Second)
	clock := platform.SystemClock{}
	ids := platform.UUIDGenerator{}

	// --- repositories (ports -> Postgres adapters) ---
	users := postgres.UserRepo{Pool: pool}
	events := postgres.EventRepo{Pool: pool}
	sectors := postgres.SectorRepo{Pool: pool}
	queueRepo := postgres.QueueRepo{Pool: pool}
	reservationsRepo := postgres.ReservationRepo{Pool: pool}
	ordersRepo := postgres.OrderRepo{Pool: pool}
	paymentsRepo := postgres.PaymentRepo{Pool: pool}

	// --- use cases ---
	tokens := platform.NewTokenService(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL, redisClient, ids, clock)
	authSvc := usecase.NewAuthService(users, platform.BcryptHasher{}, tokens)
	eventSvc := usecase.NewEventService(events, sectors)
	queueSvc := usecase.NewQueueService(queueRepo, events, redisClient, clock, ids, cfg.QueueAdmitBatch)
	reservationSvc := usecase.NewReservationService(reservationsRepo, sectors, redisClient, queueSvc, clock, ids, cfg.ReservationTTL)
	orderSvc := usecase.NewOrderService(ordersRepo, reservationsRepo, sectors, bkr, ids)
	paymentSvc := usecase.NewPaymentService(ordersRepo, reservationsRepo, paymentsRepo, gateway, ids)

	// --- background: TTL sweeper ---
	go runSweeper(ctx, reservationSvc)

	// --- background: async payment worker ---
	if err := bkr.Consume(ctx, usecase.TopicPaymentRequested, paymentWorker(paymentSvc)); err != nil {
		log.Fatalf("payment worker: %v", err)
	}

	// --- readiness probe ---
	readiness := func(ctx context.Context) map[string]string {
		checks := map[string]string{"postgres": "ok", "redis": "ok"}
		c, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		if err := pool.Ping(c); err != nil {
			checks["postgres"] = "down"
		}
		if err := rdb.Ping(c).Err(); err != nil {
			checks["redis"] = "down"
		}
		return checks
	}

	routes := httptransport.NewServer(authSvc, eventSvc, queueSvc, reservationSvc, orderSvc, paymentSvc, tokens, cfg.PaymentWebhookSecret, readiness).Routes()
	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		// otelhttp creates a server span per request; child spans (lock, decrement) nest
		// under it via the request context.
		Handler:           otelhttp.NewHandler(routes, "http.server"),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("listening on %s", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}

// runSweeper periodically expires held reservations past their TTL and returns stock.
func runSweeper(ctx context.Context, svc *usecase.ReservationService) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if n, err := svc.SweepExpired(ctx, 100); err == nil && n > 0 {
				log.Printf("sweeper: expired %d reservations", n)
			}
		}
	}
}

// paymentWorker returns a broker handler that processes a payment request with retry
// and exponential backoff plus jitter. Timeouts live in the gateway client.
func paymentWorker(svc *usecase.PaymentService) func(context.Context, []byte) error {
	return func(ctx context.Context, body []byte) error {
		var msg usecase.PaymentRequested
		if err := json.Unmarshal(body, &msg); err != nil {
			return nil // undecodable message: drop it, retrying will not help
		}
		var lastErr error
		for attempt := 0; attempt < 3; attempt++ {
			if attempt > 0 {
				backoff := time.Duration(1<<attempt)*100*time.Millisecond + time.Duration(rand.Intn(100))*time.Millisecond
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(backoff):
				}
			}
			if lastErr = svc.ProcessPaymentRequest(ctx, msg.OrderID); lastErr == nil {
				return nil
			}
		}
		log.Printf("payment worker: giving up on order after retries: %v", lastErr)
		return lastErr
	}
}
