package http

import (
	"encoding/json"
	"net/http"

	"github.com/ticketing-labs/backend-go/internal/domain"
)

type ctxKey string

const (
	ctxRequestID ctxKey = "request_id"
	ctxUserID    ctxKey = "user_id"
	ctxUserRole  ctxKey = "user_role"
)

// statusFor maps a stable domain error code to an HTTP status. The mapping lives in
// one place so every handler reports the same code for the same failure.
func statusFor(code string) int {
	switch code {
	case domain.ErrBadRequest.Code:
		return http.StatusBadRequest
	case domain.ErrInvalidCredentials.Code, domain.ErrInvalidToken.Code:
		return http.StatusUnauthorized
	case domain.ErrForbidden.Code, domain.ErrNotAdmitted.Code:
		return http.StatusForbidden
	case domain.ErrNotFound.Code:
		return http.StatusNotFound
	case domain.ErrValidation.Code:
		return http.StatusUnprocessableEntity
	case domain.ErrInventoryExhausted.Code, domain.ErrConflict.Code, domain.ErrReservationState.Code:
		return http.StatusConflict
	case domain.ErrRateLimited.Code, domain.ErrLockUnavailable.Code:
		return http.StatusTooManyRequests
	default:
		return http.StatusInternalServerError
	}
}

type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

// writeError converts any error into the standard envelope. It never leaks internal
// detail: unrecognised errors collapse to a generic 500 with a safe message.
func writeError(w http.ResponseWriter, r *http.Request, err error) {
	de := domain.AsError(err)
	reqID, _ := r.Context().Value(ctxRequestID).(string)
	writeJSON(w, statusFor(de.Code), errorBody{Error: errorDetail{
		Code:      de.Code,
		Message:   de.Message,
		RequestID: reqID,
	}})
}
