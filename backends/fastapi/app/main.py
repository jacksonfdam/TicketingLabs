"""FastAPI composition root. The one module allowed to know about Postgres, Redis, and
RabbitMQ at once. It wires concrete adapters into the use cases, mounts the routes,
and runs the TTL sweeper and async payment worker as background tasks.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import random
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import timedelta

import asyncpg
from fastapi import FastAPI, Header, Request, Response
from fastapi.responses import JSONResponse
from redis.asyncio import Redis

from app.adapter import postgres
from app.adapter.broker import Broker
from app.adapter.paymentgw import PaymentGatewayClient
from app.adapter.redis_adp import RedisAdapter
from app.config import load
from app.domain import errors
from app.platform.services import BcryptHasher, SystemClock, UUIDGenerator
from app.platform.token import TokenService
from app.transport.http import dtos
from app.transport.http import errors as http_errors
from app.usecase.auth import AuthService
from app.usecase.events import EventService
from app.usecase.order import TOPIC_PAYMENT_REQUESTED, OrderService
from app.usecase.payment import PaymentService
from app.usecase.queue import QueueService
from app.usecase.reservation import ReservationService


@dataclass
class Services:
    auth: AuthService
    events: EventService
    queue: QueueService
    reservations: ReservationService
    orders: OrderService
    payments: PaymentService
    tokens: TokenService
    webhook_secret: str
    pool: asyncpg.Pool
    redis: Redis


def _svc(request: Request) -> Services:
    return request.app.state.services


async def _current_user(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise errors.INVALID_TOKEN
    user_id, _role = _svc(request).tokens.parse_access(auth[len("Bearer "):])
    return user_id


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = load()
    clock, ids = SystemClock(), UUIDGenerator()

    pool = await asyncpg.create_pool(cfg.database_url, min_size=1, max_size=10)
    redis = Redis.from_url(cfg.redis_url)
    redis_adp = RedisAdapter(redis)
    broker = await Broker.connect(cfg.broker_url)
    gateway = PaymentGatewayClient(cfg.payment_gateway_url)

    tokens = TokenService(
        cfg.jwt_secret,
        timedelta(seconds=cfg.access_ttl_seconds),
        timedelta(seconds=cfg.refresh_ttl_seconds),
        redis_adp, ids, clock,
    )
    auth = AuthService(postgres.Users(pool), BcryptHasher(), tokens)
    events = EventService(postgres.Events(pool), postgres.Sectors(pool))
    queue = QueueService(postgres.QueueRepo(pool), postgres.Events(pool), redis_adp, clock, ids, cfg.queue_admit_batch)
    reservations = ReservationService(
        postgres.ReservationRepo(pool), postgres.Sectors(pool), redis_adp, queue, clock, ids,
        timedelta(seconds=cfg.reservation_ttl_seconds),
    )
    orders = OrderService(postgres.OrderRepo(pool), postgres.ReservationRepo(pool), postgres.Sectors(pool), broker, ids)
    payments = PaymentService(
        postgres.OrderRepo(pool), postgres.ReservationRepo(pool), postgres.PaymentRepo(pool), gateway, ids
    )

    app.state.services = Services(
        auth, events, queue, reservations, orders, payments, tokens, cfg.payment_webhook_secret, pool, redis
    )

    async def sweeper():
        while True:
            await asyncio.sleep(5)
            try:
                await reservations.sweep_expired(100)
            except Exception:  # noqa: BLE001 - a failed sweep must not kill the loop
                pass

    async def payment_handler(body: bytes) -> None:
        order_id = json.loads(body).get("order_id")
        if not order_id:
            return
        last: Exception | None = None
        for attempt in range(3):
            if attempt:
                await asyncio.sleep((2 ** attempt) * 0.1 + random.random() * 0.1)
            try:
                await payments.process_payment_request(order_id)
                return
            except Exception as exc:  # noqa: BLE001 - retry with backoff
                last = exc
        if last:
            raise last

    sweeper_task = asyncio.create_task(sweeper())
    await broker.consume(TOPIC_PAYMENT_REQUESTED, payment_handler)

    try:
        yield
    finally:
        sweeper_task.cancel()
        await broker.close()
        await redis.aclose()
        await pool.close()


def create_app() -> FastAPI:
    app = FastAPI(title="Ticketing Labs API (FastAPI)", lifespan=lifespan)
    http_errors.register(app)

    @app.middleware("http")
    async def request_id(request: Request, call_next):
        rid = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response

    # --- system ---
    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/ready")
    async def ready(request: Request):
        checks = {"postgres": "ok", "redis": "ok"}
        s = _svc(request)
        try:
            await s.pool.fetchval("SELECT 1")
        except Exception:  # noqa: BLE001
            checks["postgres"] = "down"
        try:
            await s.redis.ping()
        except Exception:  # noqa: BLE001
            checks["redis"] = "down"
        status = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
        code = 200 if status == "ok" else 503
        return JSONResponse(status_code=code, content={"status": status, "checks": checks})

    # --- auth ---
    @app.post("/auth/login")
    async def login(request: Request, body: dtos.LoginReq):
        pair = await _svc(request).auth.login(body.email, body.password)
        return dtos.token_pair(pair)

    @app.post("/auth/refresh")
    async def refresh(request: Request, body: dtos.RefreshReq):
        pair = await _svc(request).auth.refresh(body.refresh_token)
        return dtos.token_pair(pair)

    # --- events ---
    @app.get("/events")
    async def list_events(request: Request, cursor: str = "", limit: int = 20):
        events, next_cursor = await _svc(request).events.list(cursor, limit)
        resp = JSONResponse(content=dtos.event_page(events, next_cursor))
        resp.headers["Cache-Control"] = "public, max-age=30"
        return resp

    @app.get("/events/{event_id}")
    async def get_event(request: Request, event_id: str, if_none_match: str | None = Header(default=None)):
        detail = await _svc(request).events.get(event_id)
        etag = _weak_etag(detail)
        if if_none_match == etag:
            return Response(status_code=304, headers={"ETag": etag})
        resp = JSONResponse(content=dtos.event_detail(detail))
        resp.headers["ETag"] = etag
        resp.headers["Cache-Control"] = "public, max-age=5"
        return resp

    # --- queue ---
    @app.post("/events/{event_id}/queue", status_code=201)
    async def join_queue(request: Request, event_id: str):
        user_id = await _current_user(request)
        token = await _svc(request).queue.join(user_id, event_id)
        return dtos.queue_token(token)

    @app.get("/events/{event_id}/queue/status")
    async def queue_status(request: Request, event_id: str):
        user_id = await _current_user(request)
        token = await _svc(request).queue.status(user_id, event_id)
        return dtos.queue_token(token)

    # --- reservations ---
    @app.post("/reservations")
    async def create_reservation(
        request: Request, body: dtos.CreateReservationReq,
        idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ):
        if not idempotency_key:
            raise errors.VALIDATION
        user_id = await _current_user(request)
        result = await _svc(request).reservations.create(user_id, body.sector_id, body.quantity, idempotency_key)
        status = 200 if result.replayed else 201
        return JSONResponse(status_code=status, content=dtos.reservation(result.reservation))

    @app.delete("/reservations/{reservation_id}", status_code=204)
    async def release_reservation(request: Request, reservation_id: str):
        user_id = await _current_user(request)
        await _svc(request).reservations.release(user_id, reservation_id)
        return Response(status_code=204)

    # --- orders ---
    @app.post("/orders", status_code=202)
    async def create_order(
        request: Request, body: dtos.CreateOrderReq,
        idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ):
        if not idempotency_key:
            raise errors.VALIDATION
        user_id = await _current_user(request)
        order = await _svc(request).orders.create(user_id, body.reservation_id, idempotency_key)
        return JSONResponse(status_code=202, content=dtos.order(order))

    @app.get("/orders/{order_id}")
    async def get_order(request: Request, order_id: str):
        await _current_user(request)
        order = await _svc(request).orders.get(order_id)
        return dtos.order(order)

    # --- webhook ---
    @app.post("/webhooks/payment")
    async def payment_webhook(request: Request, x_signature: str | None = Header(default=None)):
        raw = await request.body()
        s = _svc(request)
        if not _valid_signature(s.webhook_secret, x_signature or "", raw):
            raise errors.INVALID_TOKEN
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise errors.VALIDATION from exc
        await s.payments.handle_webhook(data.get("provider_ref", ""), data.get("order_id", ""), data.get("status") == "succeeded")
        return {"status": "ok"}

    return app


def _valid_signature(secret: str, signature: str, body: bytes) -> bool:
    want = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    try:
        return hmac.compare_digest(signature, want)
    except TypeError:
        # compare_digest rejects non-ASCII strings. A signature with junk bytes is
        # simply invalid; say so rather than crash into a 500.
        return False


def _weak_etag(detail) -> str:
    h = hashlib.sha256()
    h.update(f"{detail.event.id}:{detail.event.status.value}".encode())
    for s in detail.sectors:
        h.update(f"|{s.id}:{s.available_inventory}".encode())
    return f'W/"{h.hexdigest()[:16]}"'


app = create_app()
