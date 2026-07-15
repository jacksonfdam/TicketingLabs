"""Wire DTOs. Request bodies are Pydantic models; responses are built as plain dicts by
mapper functions so the JSON matches contract/openapi.yaml exactly (snake_case fields,
RFC3339 timestamps). Keeping response shaping explicit avoids surprises from automatic
serialisation.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.domain.models import Event, Order, QueueToken, Reservation, Sector
from app.usecase.auth import TokenPair
from app.usecase.events import EventDetail


# --- request models ---

class LoginReq(BaseModel):
    email: str
    password: str


class RefreshReq(BaseModel):
    refresh_token: str


class CreateReservationReq(BaseModel):
    sector_id: str
    quantity: int


class CreateOrderReq(BaseModel):
    reservation_id: str


# --- response mappers ---

def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def token_pair(p: TokenPair) -> dict:
    return {
        "access_token": p.access_token,
        "refresh_token": p.refresh_token,
        "token_type": "Bearer",
        "expires_in": p.expires_in,
    }


def event(e: Event) -> dict:
    return {
        "id": e.id,
        "name": e.name,
        "venue": e.venue,
        "starts_at": _iso(e.starts_at),
        "sales_open_at": _iso(e.sales_open_at),
        "status": e.status.value,
    }


def sector(s: Sector) -> dict:
    return {
        "id": s.id,
        "event_id": s.event_id,
        "name": s.name,
        "price_cents": s.price_cents,
        "currency": s.currency,
        "total_inventory": s.total_inventory,
        "available_inventory": s.available_inventory,
    }


def event_detail(d: EventDetail) -> dict:
    return {**event(d.event), "sectors": [sector(s) for s in d.sectors]}


def event_page(events: list[Event], next_cursor: str) -> dict:
    return {"data": [event(e) for e in events], "next_cursor": next_cursor or None}


def queue_token(t: QueueToken) -> dict:
    return {
        "id": t.id,
        "user_id": t.user_id,
        "event_id": t.event_id,
        "position": t.position,
        "status": t.status.value,
        "admitted_at": _iso(t.admitted_at),
    }


def reservation(r: Reservation) -> dict:
    return {
        "id": r.id,
        "user_id": r.user_id,
        "sector_id": r.sector_id,
        "quantity": r.quantity,
        "status": r.status.value,
        "expires_at": _iso(r.expires_at),
    }


def order(o: Order) -> dict:
    return {
        "id": o.id,
        "reservation_id": o.reservation_id,
        "user_id": o.user_id,
        "amount_cents": o.amount_cents,
        "status": o.status.value,
        "created_at": _iso(o.created_at),
    }
