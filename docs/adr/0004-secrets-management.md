# 4. Secrets come from the environment, never the repository

Date: 2026-07-15

## Status

Accepted

## Context

The fastest way to leak a credential is to commit it. The second fastest is to commit
it, notice, delete it, and forget that git remembers everything. A public teaching
repo is exactly the kind of place a stray secret gets scraped within the hour.

## Decision

- No secret is ever committed. `.env` is gitignored; only `.env.example` with
  obviously-fake placeholder values is tracked.
- Backends read configuration from environment variables at startup.
- Local development uses `.env`. Real deployments inject secrets from a manager
  (Kubernetes Secrets, cloud secret managers, or a vault); the `infra/k8s` manifests
  wire values from `Secret` objects, not literals.
- The application connects to Postgres as the least-privilege `ticketing_app` role,
  never as the superuser. See `contract/db/migrations/0002_app_role.sql`.

Any value in this repo ending in `_local_dev_only` is a placeholder and is safe
precisely because it protects nothing real.

## Consequences

- Rotating a secret is a deployment concern, not a code change.
- Local onboarding costs one `cp .env.example .env`.
- We rely on discipline plus `.gitignore` plus (recommended) a pre-commit secret
  scanner. None of these is foolproof; committing secrets is a people problem that
  tooling only mitigates.
