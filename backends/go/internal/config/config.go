// Package config reads all configuration from the environment. Nothing is hard-coded
// and nothing is read from a committed file; see docs/adr/0004.
package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPAddr             string
	DatabaseURL          string
	RedisURL             string
	BrokerURL            string
	JWTSecret            string
	AccessTTL            time.Duration
	RefreshTTL           time.Duration
	PaymentGatewayURL    string
	PaymentWebhookSecret string
	ReservationTTL       time.Duration
	QueueAdmitBatch      int
}

func Load() Config {
	return Config{
		HTTPAddr:             env("HTTP_ADDR", ":8080"),
		DatabaseURL:          env("DATABASE_URL", "postgres://ticketing_app:app_local_dev_only@localhost:5432/ticketing?sslmode=disable"),
		RedisURL:             env("REDIS_URL", "redis://localhost:6379/0"),
		BrokerURL:            env("BROKER_URL", "amqp://guest:guest_local_dev_only@localhost:5672/"),
		JWTSecret:            env("JWT_SECRET", "change_me_local_dev_only"),
		AccessTTL:            time.Duration(envInt("ACCESS_TOKEN_TTL_SECONDS", 900)) * time.Second,
		RefreshTTL:           time.Duration(envInt("REFRESH_TOKEN_TTL_SECONDS", 1209600)) * time.Second,
		PaymentGatewayURL:    env("PAYMENT_GATEWAY_URL", "http://localhost:9090"),
		PaymentWebhookSecret: env("PAYMENT_WEBHOOK_SECRET", "dev_webhook_secret"),
		ReservationTTL:       time.Duration(envInt("RESERVATION_TTL_SECONDS", 120)) * time.Second,
		QueueAdmitBatch:      envInt("QUEUE_ADMIT_BATCH", 50),
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
