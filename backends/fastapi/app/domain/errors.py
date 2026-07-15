"""Domain errors: a stable machine code plus a safe, public message.

A DomainError never carries a stack trace or a SQL string. The transport layer maps
its code to an HTTP status and wraps the message in the standard envelope. Internal
detail stays internal, exactly as in the Go backend.
"""
from __future__ import annotations


class DomainError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


# The catalogue, phrased for a stranger's eyes. Codes match the Go backend so the
# contract's error codes are identical across languages.
BAD_REQUEST = DomainError("bad_request", "The request was malformed")
INVALID_CREDENTIALS = DomainError("invalid_credentials", "Email or password is incorrect")
INVALID_TOKEN = DomainError("invalid_token", "Token is missing, expired, or invalid")
FORBIDDEN = DomainError("forbidden", "You are not allowed to do that")
NOT_FOUND = DomainError("not_found", "Resource not found")
VALIDATION = DomainError("validation_error", "The request failed validation")
NOT_ADMITTED = DomainError("not_admitted", "You need an admitted queue token for this event")
INVENTORY_EXHAUSTED = DomainError("inventory_exhausted", "Not enough inventory available")
RESERVATION_STATE = DomainError("reservation_state", "Reservation is not in a state that allows this")
CONFLICT = DomainError("conflict", "The request conflicts with the current state")
RATE_LIMITED = DomainError("rate_limited", "Too many requests")
LOCK_UNAVAILABLE = DomainError("lock_unavailable", "The resource is busy, please retry")
INTERNAL = DomainError("internal_error", "Something went wrong on our end")
