"""Domain entities and enums.

This module imports nothing from FastAPI, asyncpg, or redis. It is the same model the
Go backend implements; only the language changes. If this file ever imports a
framework, the architecture has sprung a leak. See docs/adr/0003.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class Role(str, Enum):
    CUSTOMER = "customer"
    ADMIN = "admin"


class EventStatus(str, Enum):
    DRAFT = "draft"
    ON_SALE = "on_sale"
    SOLD_OUT = "sold_out"
    CLOSED = "closed"


class QueueStatus(str, Enum):
    WAITING = "waiting"
    ADMITTED = "admitted"
    EXPIRED = "expired"


class ReservationStatus(str, Enum):
    HELD = "held"
    CONFIRMED = "confirmed"
    RELEASED = "released"
    EXPIRED = "expired"


class OrderStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


class PaymentStatus(str, Enum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass
class User:
    id: str
    email: str
    password_hash: str
    role: Role
    created_at: datetime


@dataclass
class Event:
    id: str
    name: str
    venue: str
    starts_at: datetime
    sales_open_at: datetime
    status: EventStatus


@dataclass
class Sector:
    id: str
    event_id: str
    name: str
    price_cents: int
    currency: str
    total_inventory: int
    available_inventory: int


@dataclass
class QueueToken:
    id: str
    user_id: str
    event_id: str
    position: int
    status: QueueStatus
    admitted_at: datetime | None = None


@dataclass
class Reservation:
    id: str
    user_id: str
    sector_id: str
    quantity: int
    status: ReservationStatus
    expires_at: datetime
    idempotency_key: str
    created_at: datetime | None = None


@dataclass
class Order:
    id: str
    reservation_id: str
    user_id: str
    amount_cents: int
    status: OrderStatus
    idempotency_key: str | None = None
    created_at: datetime | None = None


@dataclass
class Payment:
    id: str
    order_id: str
    provider_ref: str
    status: PaymentStatus
    attempts: int = 0
