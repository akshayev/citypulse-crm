"""Tests for parallel chunked batch scoring + aggregation + dedup."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from backend.ai_pipeline import scorer


def _make_db(shops, existing):
    """Supabase mock routing cleaned_shops vs crm_leads reads by table name."""
    cleaned = MagicMock()
    cleaned.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=shops)
    )
    leads = MagicMock()
    leads.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(
        data=existing
    )
    db = MagicMock()
    db.table.side_effect = lambda name: cleaned if name == "cleaned_shops" else leads
    return db


def test_score_batch_parallel_aggregates(monkeypatch):
    shops = [{"place_id": f"p{i}"} for i in range(7)]  # > _SCORE_CONCURRENCY (chunks)
    monkeypatch.setattr(scorer, "get_supabase_client", lambda: _make_db(shops, []))
    monkeypatch.setattr(
        scorer,
        "score_single_lead",
        AsyncMock(
            return_value={
                "status": "success",
                "usage": {"provider": "gemini", "tokens_in": 100, "tokens_out": 20},
            }
        ),
    )

    res = asyncio.run(scorer.score_batch_from_scrape("sid"))

    assert res["scored"] == 7
    assert res["gemini_calls"] == 7
    assert res["llm_cost_usd"] > 0
    assert scorer.score_single_lead.await_count == 7


def test_score_batch_skips_already_scored(monkeypatch):
    shops = [{"place_id": "p1"}, {"place_id": "p2"}]
    monkeypatch.setattr(
        scorer, "get_supabase_client", lambda: _make_db(shops, [{"place_id": "p1"}])
    )
    mock_score = AsyncMock(
        return_value={
            "status": "success",
            "usage": {"provider": "groq", "tokens_in": 0, "tokens_out": 0},
        }
    )
    monkeypatch.setattr(scorer, "score_single_lead", mock_score)

    res = asyncio.run(scorer.score_batch_from_scrape("sid"))

    assert res["scored"] == 1  # p1 already scored → skipped
    assert mock_score.await_count == 1
