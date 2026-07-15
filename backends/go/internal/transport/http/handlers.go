package http

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/ticketing-labs/backend-go/internal/domain"
	"github.com/ticketing-labs/backend-go/internal/usecase"
)

type Server struct {
	auth          *usecase.AuthService
	events        *usecase.EventService
	queue         *usecase.QueueService
	reservations  *usecase.ReservationService
	orders        *usecase.OrderService
	payments      *usecase.PaymentService
	tokens        usecase.TokenService
	webhookSecret string
	readiness     func(context.Context) map[string]string
}

func NewServer(
	auth *usecase.AuthService, events *usecase.EventService, queue *usecase.QueueService,
	reservations *usecase.ReservationService, orders *usecase.OrderService, payments *usecase.PaymentService,
	tokens usecase.TokenService, webhookSecret string, readiness func(context.Context) map[string]string,
) *Server {
	return &Server{
		auth: auth, events: events, queue: queue, reservations: reservations,
		orders: orders, payments: payments, tokens: tokens,
		webhookSecret: webhookSecret, readiness: readiness,
	}
}

func decode(r *http.Request, v any) error {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return domain.ErrValidation
	}
	return nil
}

// --- auth ---

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := decode(r, &req); err != nil {
		writeError(w, r, err)
		return
	}
	pair, err := s.auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toTokenPair(pair))
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var req refreshReq
	if err := decode(r, &req); err != nil {
		writeError(w, r, err)
		return
	}
	pair, err := s.auth.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toTokenPair(pair))
}

// --- events ---

func (s *Server) handleListEvents(w http.ResponseWriter, r *http.Request) {
	cursor := r.URL.Query().Get("cursor")
	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			limit = n
		}
	}
	events, next, err := s.events.List(r.Context(), cursor, limit)
	if err != nil {
		writeError(w, r, err)
		return
	}
	page := eventPageDTO{Data: make([]eventDTO, 0, len(events))}
	for _, e := range events {
		page.Data = append(page.Data, toEvent(e))
	}
	if next != "" {
		page.NextCursor = &next
	}
	w.Header().Set("Cache-Control", "public, max-age=30")
	writeJSON(w, http.StatusOK, page)
}

func (s *Server) handleGetEvent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	detail, err := s.events.Get(r.Context(), id)
	if err != nil {
		writeError(w, r, err)
		return
	}
	// A weak ETag over the volatile bits (status + availability) lets clients and the
	// CDN skip re-downloading an unchanged event. Cheap to compute, cheap to check.
	etag := weakETag(detail)
	if match := r.Header.Get("If-None-Match"); match == etag {
		w.Header().Set("ETag", etag)
		w.WriteHeader(http.StatusNotModified)
		return
	}
	dto := eventDetailDTO{eventDTO: toEvent(detail.Event), Sectors: make([]sectorDTO, 0, len(detail.Sectors))}
	for _, sec := range detail.Sectors {
		dto.Sectors = append(dto.Sectors, toSector(sec))
	}
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "public, max-age=5")
	writeJSON(w, http.StatusOK, dto)
}

func weakETag(d *usecase.EventDetail) string {
	h := sha256.New()
	fmt.Fprintf(h, "%s:%s", d.Event.ID, d.Event.Status)
	for _, s := range d.Sectors {
		fmt.Fprintf(h, "|%s:%d", s.ID, s.AvailableInventory)
	}
	return `W/"` + hex.EncodeToString(h.Sum(nil))[:16] + `"`
}

// --- queue ---

func (s *Server) handleJoinQueue(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	token, err := s.queue.Join(r.Context(), userIDFrom(r), eventID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, toQueueToken(token))
}

func (s *Server) handleQueueStatus(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	token, err := s.queue.Status(r.Context(), userIDFrom(r), eventID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toQueueToken(token))
}

// --- reservations ---

func (s *Server) handleCreateReservation(w http.ResponseWriter, r *http.Request) {
	idemKey := r.Header.Get("Idempotency-Key")
	if idemKey == "" {
		writeError(w, r, domain.ErrValidation)
		return
	}
	var req createReservationReq
	if err := decode(r, &req); err != nil {
		writeError(w, r, err)
		return
	}
	result, err := s.reservations.Create(r.Context(), userIDFrom(r), req.SectorID, req.Quantity, idemKey)
	if err != nil {
		writeError(w, r, err)
		return
	}
	// 201 for a fresh hold, 200 for an idempotent replay. The contract distinguishes.
	status := http.StatusCreated
	if result.Replayed {
		status = http.StatusOK
	}
	writeJSON(w, status, toReservation(result.Reservation))
}

func (s *Server) handleReleaseReservation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.reservations.Release(r.Context(), userIDFrom(r), id); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- orders ---

func (s *Server) handleCreateOrder(w http.ResponseWriter, r *http.Request) {
	idemKey := r.Header.Get("Idempotency-Key")
	if idemKey == "" {
		writeError(w, r, domain.ErrValidation)
		return
	}
	var req createOrderReq
	if err := decode(r, &req); err != nil {
		writeError(w, r, err)
		return
	}
	order, err := s.orders.Create(r.Context(), userIDFrom(r), req.ReservationID, idemKey)
	if err != nil {
		writeError(w, r, err)
		return
	}
	// 202: the order exists and is pending; payment settles asynchronously.
	writeJSON(w, http.StatusAccepted, toOrder(order))
}

func (s *Server) handleGetOrder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	order, err := s.orders.Get(r.Context(), id)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toOrder(order))
}

// --- webhook ---

func (s *Server) handlePaymentWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeError(w, r, domain.ErrValidation)
		return
	}
	// Verify the HMAC before trusting a single byte of the payload. An unsigned or
	// mis-signed webhook is an unauthenticated stranger telling us an order was paid.
	if !s.validSignature(r.Header.Get("X-Signature"), body) {
		writeError(w, r, domain.ErrInvalidToken)
		return
	}
	var req webhookReq
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, r, domain.ErrValidation)
		return
	}
	if err := s.payments.HandleWebhook(r.Context(), req.ProviderRef, req.OrderID, req.Status == "succeeded"); err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) validSignature(sig string, body []byte) bool {
	mac := hmac.New(sha256.New, []byte(s.webhookSecret))
	mac.Write(body)
	want := hex.EncodeToString(mac.Sum(nil))
	return subtle.ConstantTimeCompare([]byte(sig), []byte(want)) == 1
}

// --- system ---

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, healthDTO{Status: "ok"})
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	checks := s.readiness(r.Context())
	status := "ok"
	code := http.StatusOK
	for _, v := range checks {
		if v != "ok" {
			status, code = "degraded", http.StatusServiceUnavailable
		}
	}
	writeJSON(w, code, healthDTO{Status: status, Checks: checks})
}
