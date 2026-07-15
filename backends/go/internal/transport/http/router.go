package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// Routes assembles the contract into a chi router. Public routes need no token;
// everything under requireAuth needs a valid access token. The path structure mirrors
// contract/openapi.yaml one-to-one, because it must.
func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(recoverPanic)
	r.Use(requestID)

	// Public.
	r.Get("/health", s.handleHealth)
	r.Get("/ready", s.handleReady)
	r.Post("/auth/login", s.handleLogin)
	r.Post("/auth/refresh", s.handleRefresh)
	r.Get("/events", s.handleListEvents)
	r.Get("/events/{id}", s.handleGetEvent)
	r.Post("/webhooks/payment", s.handlePaymentWebhook)

	// Authenticated.
	r.Group(func(pr chi.Router) {
		pr.Use(requireAuth(s.tokens))
		pr.Post("/events/{id}/queue", s.handleJoinQueue)
		pr.Get("/events/{id}/queue/status", s.handleQueueStatus)
		pr.Post("/reservations", s.handleCreateReservation)
		pr.Delete("/reservations/{id}", s.handleReleaseReservation)
		pr.Post("/orders", s.handleCreateOrder)
		pr.Get("/orders/{id}", s.handleGetOrder)
	})

	return r
}
