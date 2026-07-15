# Database schema and migrations

The schema lives here, in the contract, not inside any single backend. Every backend
points at the same Postgres and the same tables. Duplicating the schema per language
would be seven chances to drift; one shared schema is zero.

## Files

- `migrations/0001_init.sql` — tables, constraints, indexes. The invariants the
  database can enforce (non-negative inventory, uniqueness, foreign keys) are
  enforced here so an application bug cannot silently oversell.
- `migrations/0002_app_role.sql` — the least-privilege `ticketing_app` role the
  backends connect as. It can read and write rows; it cannot alter schema.
- `seed.sql` — one on-sale event with two sectors. The 100-seat VIP sector exists
  so the load test can sell it out and prove there is no overselling.

## Migration strategy

Files are applied in lexical order, once each, tracked by a `schema_migrations`
table (added when the first backend wires up its migrator). Migrations are forward-
only and idempotent where practical. They run as a privileged migrator role, never
as `ticketing_app`.

## Verified

These files have been applied against `postgres:16-alpine`. The
`available_inventory >= 0` check rejects an oversell, and `ticketing_app` is denied
`CREATE TABLE`. If you change the schema, re-run that check.
