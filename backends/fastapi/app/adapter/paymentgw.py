"""HTTP client for the fake payment gateway, with a hard timeout so a hanging provider
cannot hang the worker. Retry/backoff lives in the worker; a circuit breaker would wrap it (implemented in the Go backend).
"""
from __future__ import annotations

import httpx


class PaymentGatewayClient:
    def __init__(self, base_url: str):
        self._base_url = base_url.rstrip("/")

    async def charge(self, order_id: str) -> str:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.post(f"{self._base_url}/charges", json={"order_id": order_id})
            resp.raise_for_status()
            return resp.json()["provider_ref"]
