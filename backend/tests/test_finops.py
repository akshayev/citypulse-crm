import os
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")

from backend.database import finops  # noqa: E402


def test_gemini_quota_allows_when_rpc_returns_true(monkeypatch):
    db = MagicMock()
    db.rpc.return_value.execute.return_value = SimpleNamespace(data=[True])
    monkeypatch.setattr(finops, "get_supabase_client", lambda: db)

    allowed = asyncio.run(finops.check_and_increment_gemini_quota())
    assert allowed is True


def test_gemini_quota_blocks_when_rpc_returns_false(monkeypatch):
    db = MagicMock()
    db.rpc.return_value.execute.return_value = SimpleNamespace(data=[False])
    monkeypatch.setattr(finops, "get_supabase_client", lambda: db)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(finops.check_and_increment_gemini_quota())

    assert exc.value.status_code == 429


def test_gemini_quota_falls_back_when_rpc_fails(monkeypatch):
    db = MagicMock()
    db.rpc.return_value.execute.side_effect = RuntimeError("rpc unavailable")
    monkeypatch.setattr(finops, "get_supabase_client", lambda: db)
    fallback = AsyncMock(return_value=True)
    monkeypatch.setattr(finops, "_fallback_check_gemini", fallback)

    allowed = asyncio.run(finops.check_and_increment_gemini_quota())

    assert allowed is True
    fallback.assert_awaited_once()


def test_scraper_quota_blocks_when_rpc_returns_false(monkeypatch):
    db = MagicMock()
    db.rpc.return_value.execute.return_value = SimpleNamespace(data=[False])
    monkeypatch.setattr(finops, "get_supabase_client", lambda: db)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(finops.check_and_increment_scraper_quota())

    assert exc.value.status_code == 429
