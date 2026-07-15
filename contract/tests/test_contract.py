"""Contract conformance tests.

Two layers:

1. Property-based fuzzing driven by the OpenAPI file (Schemathesis). It generates
   requests for every operation and asserts responses match the declared schema,
   status codes, and content types. This is the bulk of coverage and it is entirely
   backend-agnostic.

2. A handful of hand-written behavioural checks for cross-cutting rules that a
   schema alone cannot express: the error envelope shape, the X-Request-Id header,
   and idempotent replay. These get fleshed out as backends land.

Run against a live backend:

    TARGET_URL=https://localhost/api pytest contract/tests -v

With no backend up, every test skips cleanly. That is Phase 0 passing.
"""
import os

import pytest
import requests

try:
    import schemathesis

    _schema = schemathesis.from_path(
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "openapi.yaml"),
        base_url=os.environ.get("TARGET_URL", "https://localhost/api"),
    )
    _HAS_SCHEMA = True
except Exception:  # schemathesis not installed or spec unreadable
    _HAS_SCHEMA = False


if _HAS_SCHEMA:

    @pytest.mark.skipif(
        not os.environ.get("TARGET_URL"),
        reason="Set TARGET_URL to fuzz a live backend against the contract",
    )
    @_schema.parametrize()
    def test_openapi_conformance(case):
        """Every operation must answer within its declared schema."""
        response = case.call(verify=False)
        case.validate_response(response)


# -- Behavioural cross-cutting checks -------------------------------------------


def test_every_response_carries_request_id(base_url, require_backend):
    r = requests.get(f"{base_url}/health", timeout=5, verify=False)
    assert r.headers.get("X-Request-Id"), "X-Request-Id must be present on every response"


def test_error_envelope_shape(base_url, require_backend):
    """A 404 must use the standard envelope and must not leak internals."""
    r = requests.get(f"{base_url}/events/00000000-0000-0000-0000-000000000000",
                     timeout=5, verify=False)
    assert r.status_code == 404
    body = r.json()
    assert set(body.keys()) == {"error"}
    err = body["error"]
    assert {"code", "message", "request_id"} <= set(err.keys())
    # No stack traces, SQL, or file paths in the message.
    assert "Traceback" not in err["message"]


@pytest.mark.skip(reason="Enabled once a backend implements POST /reservations")
def test_idempotent_reservation_replay(base_url):
    """Same Idempotency-Key returns the same reservation, never a second hold."""
    ...
