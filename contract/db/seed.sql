-- seed.sql
-- Minimal demo data so a freshly cloned repo has something to sell.
-- One event, on sale, with two sectors: a big cheap one and a small expensive one.
-- The small one exists so the load test can sell it out and prove there is no
-- overselling. Deterministic UUIDs make it easy to script against.
--
-- Password hash below is bcrypt of "password123" (demo only, obviously). bcrypt is
-- used rather than argon2 so the identical hash authenticates against every backend
-- in the lab; the hash format is portable across languages.

INSERT INTO users (id, email, password_hash, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@ticketing.local',
   '$2a$10$sk1Pugb24Q6a8bp7CBGCIuB5XCIxPPCJg1gPvj.FL/d.wFX3/a.gm', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'buyer@ticketing.local',
   '$2a$10$sk1Pugb24Q6a8bp7CBGCIuB5XCIxPPCJg1gPvj.FL/d.wFX3/a.gm', 'customer')
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (id, name, venue, starts_at, sales_open_at, status) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'The Concurrency Sessions',
   'Estadio do Deadlock',
   now() + interval '30 days',
   now() - interval '1 minute',
   'on_sale')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sectors (id, event_id, name, price_cents, currency, total_inventory, available_inventory) VALUES
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111',
   'Pista', 12000, 'BRL', 10000, 10000),
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'Camarote VIP', 45000, 'BRL', 100, 100)
ON CONFLICT (id) DO NOTHING;
