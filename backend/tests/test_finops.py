import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

# Required env vars are set in conftest.py before this import.
from backend.database import finops


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
