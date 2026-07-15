"""Configuration read entirely from the environment. See docs/adr/0004."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class Config:
    database_url: str
    redis_url: str
    broker_url: str
    jwt_secret: str
    access_ttl_seconds: int
    refresh_ttl_seconds: int
    payment_gateway_url: str
    payment_webhook_secret: str
    reservation_ttl_seconds: int
    queue_admit_batch: int


def load() -> Config:
    return Config(
        database_url=os.getenv("DATABASE_URL", "postgres://ticketing_app:app_local_dev_only@localhost:5432/ticketing"),
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        broker_url=os.getenv("BROKER_URL", "amqp://guest:guest_local_dev_only@localhost:5672/"),
        jwt_secret=os.getenv("JWT_SECRET", "change_me_local_dev_only"),
        access_ttl_seconds=int(os.getenv("ACCESS_TOKEN_TTL_SECONDS", "900")),
        refresh_ttl_seconds=int(os.getenv("REFRESH_TOKEN_TTL_SECONDS", "1209600")),
        payment_gateway_url=os.getenv("PAYMENT_GATEWAY_URL", "http://localhost:9090"),
        payment_webhook_secret=os.getenv("PAYMENT_WEBHOOK_SECRET", "dev_webhook_secret"),
        reservation_ttl_seconds=int(os.getenv("RESERVATION_TTL_SECONDS", "120")),
        queue_admit_batch=int(os.getenv("QUEUE_ADMIT_BATCH", "50")),
    )
