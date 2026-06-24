"""
Shared pytest fixtures and environment setup.

Importing backend.main / backend.config instantiates pydantic Settings, which
requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY. These are
set here once (before any test module imports the app) so the suite runs in CI
without real secrets.
"""

import os

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("BACKEND_API_KEY", "dev-secret-key-123")
