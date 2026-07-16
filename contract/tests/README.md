# Contract tests

One test suite. Every backend. No exceptions and no per-framework branches.

The backend under test is chosen entirely by the `TARGET_URL` environment variable.
Point it at any backend behind the gateway and the same tests run. If a backend
passes here, it honours the contract. If it does not, it does not, regardless of how
elegant its dependency injection is.

## What runs

- **Schemathesis** reads `../openapi.yaml` and generates requests for every
  operation, asserting each response conforms to the declared schema, status codes,
  and content type. This is property-based fuzzing, so it finds the edge cases you
  would not have thought to write down.
- **Behavioural checks** in `test_contract.py` cover the cross-cutting rules a schema
  cannot express: the error envelope, the `X-Request-Id` header, idempotent replay.

## Running

```bash
pip install -r requirements.txt

# No backend up: everything skips cleanly. This is expected and green.
pytest -v

# With a backend running: point at it behind the gateway.
TARGET_URL=https://localhost/api pytest -v
```

With no backend responding at `TARGET_URL/health`, the suite skips rather than
fails. An empty-but-executable suite is the starting point; the assertions
switch on once a backend implements the endpoints.
