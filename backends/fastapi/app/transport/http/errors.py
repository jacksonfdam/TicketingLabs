"""Error handling: map domain errors to HTTP status codes and the standard envelope,
and make FastAPI's own validation failures conform to the contract too.
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.domain import errors
from app.domain.errors import DomainError

# One place for the code -> status mapping, mirroring the Go backend.
_STATUS = {
    errors.BAD_REQUEST.code: 400,
    errors.INVALID_CREDENTIALS.code: 401,
    errors.INVALID_TOKEN.code: 401,
    errors.FORBIDDEN.code: 403,
    errors.NOT_ADMITTED.code: 403,
    errors.NOT_FOUND.code: 404,
    errors.VALIDATION.code: 422,
    errors.INVENTORY_EXHAUSTED.code: 409,
    errors.CONFLICT.code: 409,
    errors.RESERVATION_STATE.code: 409,
    errors.RATE_LIMITED.code: 429,
    errors.LOCK_UNAVAILABLE.code: 429,
    errors.INTERNAL.code: 500,
}


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


def envelope(request: Request, err: DomainError) -> JSONResponse:
    status = _STATUS.get(err.code, 500)
    return JSONResponse(
        status_code=status,
        content={"error": {"code": err.code, "message": err.message, "request_id": _request_id(request)}},
        headers={"X-Request-Id": _request_id(request)},
    )


def register(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(request: Request, exc: DomainError):
        return envelope(request, exc)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        # A body/param that fails framework validation is a malformed request. Map it
        # to the shared 400, which every operation documents, rather than FastAPI's
        # default 422 with its own (non-envelope) body shape.
        return envelope(request, errors.BAD_REQUEST)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        # Never leak internals. Anything unrecognised becomes a generic 500 envelope.
        return envelope(request, errors.INTERNAL)
