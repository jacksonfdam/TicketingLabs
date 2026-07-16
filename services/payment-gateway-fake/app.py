"""Fake payment gateway.

It pretends to be an external payment provider so the backends have something to be
resilient against. Two things make it useful rather than decorative:

1. A runtime failure switch. Flip it via POST /admin/failure-mode and every
   subsequent charge fails (or times out). This is how the circuit breaker, retry,
   and timeout demos are driven live, without redeploying anything.

2. Signed webhooks. After a charge settles, it POSTs a callback to the backend with
   an X-Signature header: HMAC-SHA256 of the raw body, hex-encoded. A backend that
   does not verify this signature is a backend that trusts strangers with money.

Deliberately dependency-free (Python stdlib only) so the image is tiny and the build
is instant. It is a fake; it does not need a web framework.
"""
import hashlib
import hmac
import json
import os
import threading
import time
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WEBHOOK_SECRET = os.environ.get("PAYMENT_WEBHOOK_SECRET", "dev_webhook_secret").encode()
WEBHOOK_TARGET = os.environ.get("WEBHOOK_TARGET_URL", "http://gateway/api/webhooks/payment")
SETTLE_DELAY_S = float(os.environ.get("PAYMENT_SETTLE_DELAY_S", "1.0"))
PORT = int(os.environ.get("PORT", "9090"))

# Runtime-mutable state. "ok" settles successfully; "fail" settles as failed;
# "timeout" never calls back, so the backend's timeout has to save it.
_state = {"mode": "ok"}
_lock = threading.Lock()


def _sign(body: bytes) -> str:
    return hmac.new(WEBHOOK_SECRET, body, hashlib.sha256).hexdigest()


def _fire_webhook(order_id: str, provider_ref: str, status: str) -> None:
    payload = json.dumps(
        {"provider_ref": provider_ref, "order_id": order_id, "status": status}
    ).encode()
    req = urllib.request.Request(
        WEBHOOK_TARGET,
        data=payload,
        headers={"Content-Type": "application/json", "X-Signature": _sign(payload)},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        # A real provider retries. The backend is also idempotent by provider_ref,
        # so a lost webhook is recoverable; we do not pretend this never happens.
        pass


def _settle_later(order_id: str, provider_ref: str) -> None:
    with _lock:
        mode = _state["mode"]
    if mode == "timeout":
        return  # deliberately never call back
    time.sleep(SETTLE_DELAY_S)
    _fire_webhook(order_id, provider_ref, "succeeded" if mode == "ok" else "failed")


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            with _lock:
                mode = _state["mode"]
            return self._json(200, {"status": "ok", "mode": mode})
        self._json(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        if self.path == "/charges":
            data = self._read()
            order_id = data.get("order_id") or str(uuid.uuid4())
            with _lock:
                mode = _state["mode"]
            # The failure switch acts on the charge request itself, so the backend's
            # timeout, retry, and circuit breaker have something to react to:
            #   fail    -> reject the charge outright (502)
            #   timeout -> hang past any sane client timeout, then answer nobody is left for
            #   ok      -> accept and settle asynchronously via a signed webhook
            if mode == "fail":
                return self._json(502, {"error": "charge_rejected"})
            if mode == "timeout":
                time.sleep(10)
                return self._json(202, {"provider_ref": "pay_late", "status": "pending"})
            provider_ref = "pay_" + uuid.uuid4().hex[:16]
            threading.Thread(
                target=_settle_later, args=(order_id, provider_ref), daemon=True
            ).start()
            return self._json(202, {"provider_ref": provider_ref, "status": "pending"})

        if self.path == "/admin/failure-mode":
            data = self._read()
            mode = data.get("mode", "ok")
            if mode not in ("ok", "fail", "timeout"):
                return self._json(422, {"error": "mode must be ok|fail|timeout"})
            with _lock:
                _state["mode"] = mode
            return self._json(200, {"mode": mode})

        self._json(404, {"error": "not found"})

    def log_message(self, *args):  # keep the container logs quiet
        pass


if __name__ == "__main__":
    print(f"fake payment gateway listening on :{PORT} (mode=ok)", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
