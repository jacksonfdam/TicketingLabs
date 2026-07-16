# Architecture Decision Records

Short, numbered, immutable records of decisions that shaped this project. Format
after Michael Nygard. See ADR 1 for the why.

| # | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-single-openapi-contract.md) | A single OpenAPI contract is the source of truth | Accepted |
| [0003](0003-hexagonal-service-layer.md) | Business logic lives in a framework-agnostic service layer | Accepted |
| [0004](0004-secrets-management.md) | Secrets come from the environment, never the repository | Accepted |
| [0005](0005-openapi-3-1-and-schemathesis.md) | OpenAPI 3.1.0 with Schemathesis 3.1 support enabled | Accepted |
| [0006](0006-backend-switching-via-compose-profiles.md) | Switch the active backend with a Docker Compose profile | Accepted |
| [0007](0007-three-clients-one-contract.md) | Three client apps, one contract, no backend awareness | Accepted |
| [0008](0008-shared-client-assets-single-source.md) | Client apps share artefacts, not source | Accepted |
