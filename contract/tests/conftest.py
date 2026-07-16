"""Shared fixtures for the contract test suite.

These tests run against ANY backend. The backend under test is chosen entirely by
the TARGET_URL environment variable. There is no per-framework code here and there
never will be; that is the whole point of a single contract.
"""
import os
import pytest
import requests

CONTRACT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPENAPI_PATH = os.path.join(CONTRACT_ROOT, "openapi.yaml")

# Where the backend under test lives. Defaults to the local gateway.
TARGET_URL = os.environ.get("TARGET_URL", "https://localhost/api")


@pytest.fixture(scope="session")
def base_url() -> str:
    return TARGET_URL.rstrip("/")


@pytest.fixture(scope="session")
def backend_up(base_url: str) -> bool:
    """Skip the whole suite gracefully if nothing is listening yet.

    With no backend up, the suite is executable and green-by-skip; once a backend
    answers /health, that is the entry ticket to being tested.
    """
    try:
        r = requests.get(f"{base_url}/health", timeout=2, verify=False)
        return r.status_code == 200
    except requests.RequestException:
        return False


@pytest.fixture(scope="session")
def require_backend(backend_up: bool):
    if not backend_up:
        pytest.skip(f"No backend responding at {TARGET_URL}/health (set TARGET_URL)")
