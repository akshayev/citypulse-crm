"""
Regression tests for the DLQ double-enqueue bug.

On a retry, the handler must NOT push a new DLQ row (the worker owns retry
bookkeeping). On the first attempt it should enqueue for retry.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

from backend.ai_pipeline import scorer


def _db_with_no_shop():
    """A Supabase mock whose cleaned_shops lookup returns no rows."""
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )
    return db


def test_retry_does_not_reenqueue(monkeypatch):
    monkeypatch.setattr(scorer, "get_supabase_client", _db_with_no_shop)
    pushed = AsyncMock()
    monkeypatch.setattr(scorer, "push_to_dlq", pushed)

    # Retry path (push_to_dlq_on_error=False): must NOT create a new DLQ row.
    result = asyncio.run(
        scorer.score_single_lead("missing-place-id", push_to_dlq_on_error=False)
    )

    assert result["status"] == "error"
    assert result["dlq"] is False
    pushed.assert_not_awaited()


def test_first_attempt_enqueues(monkeypatch):
    monkeypatch.setattr(scorer, "get_supabase_client", _db_with_no_shop)
    pushed = AsyncMock()
    monkeypatch.setattr(scorer, "push_to_dlq", pushed)

    # First attempt (default): enqueues exactly once for retry.
    result = asyncio.run(scorer.score_single_lead("missing-place-id"))

    assert result["status"] == "error"
    assert result["dlq"] is True
    pushed.assert_awaited_once()
