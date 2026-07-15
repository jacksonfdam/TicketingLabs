package http

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/ticketing-labs/backend-go/internal/domain"
	"github.com/ticketing-labs/backend-go/internal/usecase"
)

// requestID ensures every request has an X-Request-Id, honouring one injected by the
// gateway and generating one otherwise. It is stashed in the context and echoed on the
// response so a single id follows a request through logs, traces, and error bodies.
func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if id == "" {
			id = uuid.NewString()
		}
		w.Header().Set("X-Request-Id", id)
		ctx := context.WithValue(r.Context(), ctxRequestID, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// recoverPanic turns a panic into a clean 500 envelope instead of a dropped
// connection. A stack trace is a debugging aid, not a response body.
func recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				writeError(w, r, domain.ErrInternal)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// requireAuth validates the bearer access token and puts the user id and role in the
// context. Absent or invalid token means 401, full stop.
func requireAuth(tokens usecase.TokenService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			auth := r.Header.Get("Authorization")
			if !strings.HasPrefix(auth, "Bearer ") {
				writeError(w, r, domain.ErrInvalidToken)
				return
			}
			userID, role, err := tokens.ParseAccess(strings.TrimPrefix(auth, "Bearer "))
			if err != nil {
				writeError(w, r, domain.ErrInvalidToken)
				return
			}
			ctx := context.WithValue(r.Context(), ctxUserID, userID)
			ctx = context.WithValue(ctx, ctxUserRole, role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func userIDFrom(r *http.Request) string {
	id, _ := r.Context().Value(ctxUserID).(string)
	return id
}
