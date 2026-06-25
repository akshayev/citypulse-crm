"""
Shared pytest fixtures and environment setup.

Importing backend.main / backend.config instantiates pydantic Settings, which
requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY. These are
set here once (before any test module imports the app) so the suite runs in CI
without real secrets.
"""

import os

import pytest

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("BACKEND_API_KEY", "dev-secret-key-123")


@pytest.fixture(autouse=True)
def _rate_limit_disabled():
    """Disable slowapi rate limiting for every test by default.

    Endpoint tests call the rate-limited routes directly; without this they
    would accumulate hits against the shared in-memory limiter and flake. The
    dedicated rate-limit test re-enables it for itself.
    """
    from backend.main import limiter

    limiter.enabled = False
    yield
    limiter.enabled = True
