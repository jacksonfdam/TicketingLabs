package domain

// Error is a domain error carrying a stable machine code and a safe, public message.
// It never contains a stack trace, a SQL string, or anything else an attacker would
// enjoy. The transport layer maps Code to an HTTP status and wraps Message in the
// standard error envelope. Internal detail stays internal.
type Error struct {
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func newErr(code, msg string) *Error { return &Error{Code: code, Message: msg} }

// The catalogue of things that can go wrong, phrased for a stranger's eyes.
var (
	ErrInvalidCredentials = newErr("invalid_credentials", "Email or password is incorrect")
	ErrInvalidToken       = newErr("invalid_token", "Token is missing, expired, or invalid")
	ErrForbidden          = newErr("forbidden", "You are not allowed to do that")
	ErrNotFound           = newErr("not_found", "Resource not found")
	ErrValidation         = newErr("validation_error", "The request failed validation")
	ErrNotAdmitted        = newErr("not_admitted", "You need an admitted queue token for this event")
	ErrInventoryExhausted = newErr("inventory_exhausted", "Not enough inventory available")
	ErrReservationState   = newErr("reservation_state", "Reservation is not in a state that allows this")
	ErrConflict           = newErr("conflict", "The request conflicts with the current state")
	ErrRateLimited        = newErr("rate_limited", "Too many requests")
	ErrLockUnavailable    = newErr("lock_unavailable", "The resource is busy, please retry")
	ErrInternal           = newErr("internal_error", "Something went wrong on our end")
)

// AsError narrows any error to a *domain.Error, returning ErrInternal for anything
// unrecognised so that raw driver errors never reach the client.
func AsError(err error) *Error {
	if err == nil {
		return nil
	}
	if de, ok := err.(*Error); ok {
		return de
	}
	return ErrInternal
}
