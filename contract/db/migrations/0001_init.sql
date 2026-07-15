-- 0001_init.sql
-- Initial schema. Shared by every backend, because the model is shared.
-- The database enforces the invariants it can (non-negative inventory, uniqueness,
-- referential integrity) so that an application bug cannot quietly oversell.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'customer'
                     CHECK (role IN ('customer', 'admin')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
CREATE TABLE events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    venue         TEXT NOT NULL,
    starts_at     TIMESTAMPTZ NOT NULL,
    sales_open_at TIMESTAMPTZ NOT NULL,
    status        TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'on_sale', 'sold_out', 'closed'))
);

CREATE INDEX idx_events_status ON events (status);
CREATE INDEX idx_events_sales_open_at ON events (sales_open_at);

-- ---------------------------------------------------------------------------
-- sectors
-- available_inventory can never go below zero. This CHECK is the last line of
-- defence: even if every lock in the application fails, Postgres refuses to
-- oversell. Belt, braces, and a second pair of braces.
-- ---------------------------------------------------------------------------
CREATE TABLE sectors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    price_cents         INTEGER NOT NULL CHECK (price_cents >= 0),
    currency            CHAR(3) NOT NULL,
    total_inventory     INTEGER NOT NULL CHECK (total_inventory >= 0),
    available_inventory INTEGER NOT NULL CHECK (available_inventory >= 0),
    CHECK (available_inventory <= total_inventory)
);

CREATE INDEX idx_sectors_event_id ON sectors (event_id);

-- ---------------------------------------------------------------------------
-- queue_tokens
-- One active token per user per event.
-- ---------------------------------------------------------------------------
CREATE TABLE queue_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event_id    UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    position    INTEGER NOT NULL CHECK (position >= 0),
    status      TEXT NOT NULL DEFAULT 'waiting'
                   CHECK (status IN ('waiting', 'admitted', 'expired')),
    admitted_at TIMESTAMPTZ,
    UNIQUE (user_id, event_id)
);

CREATE INDEX idx_queue_tokens_event_status ON queue_tokens (event_id, status);

-- ---------------------------------------------------------------------------
-- reservations
-- idempotency_key is unique per user: re-sending the same key must resolve to
-- the same reservation, never a second hold.
-- ---------------------------------------------------------------------------
CREATE TABLE reservations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    sector_id       UUID NOT NULL REFERENCES sectors (id) ON DELETE CASCADE,
    quantity        INTEGER NOT NULL CHECK (quantity >= 1),
    status          TEXT NOT NULL DEFAULT 'held'
                       CHECK (status IN ('held', 'confirmed', 'released', 'expired')),
    expires_at      TIMESTAMPTZ NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key)
);

-- Sweeper query: find held reservations past their TTL, fast.
CREATE INDEX idx_reservations_held_expiry
    ON reservations (status, expires_at)
    WHERE status = 'held';

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id  UUID NOT NULL REFERENCES reservations (id) ON DELETE RESTRICT,
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    amount_cents    INTEGER NOT NULL CHECK (amount_cents >= 0),
    status          TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    idempotency_key TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (reservation_id)
);

CREATE UNIQUE INDEX idx_orders_user_idem
    ON orders (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- payments
-- provider_ref is unique so a replayed webhook is a no-op, not a double charge.
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    provider_ref TEXT NOT NULL UNIQUE,
    status       TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'succeeded', 'failed')),
    attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

CREATE INDEX idx_payments_order_id ON payments (order_id);

COMMIT;
