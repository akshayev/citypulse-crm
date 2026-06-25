"""Tests for B2 rate limiting (slowapi).

The autouse `_rate_limit_disabled` fixture in conftest turns the limiter off for
every test; this module re-enables it for itself and restores it afterward.
"""

import pytest
from fastapi.testclient import TestClient

import backend.main as main
from backend.main import app, limiter

client = TestClient(app)

HEADERS = {"x-api-key": "dev-secret-key-123"}


@pytest.fixture
def limiter_on(monkeypatch):
    """Enable the limiter with a tiny limit and a clean storage for this test."""
    monkeypatch.setattr(main.settings, "scrape_rate_limit", "2/minute")
    # limiter.reset() is slowapi's public API; it clears the in-memory bucket and
    # only swallows NotImplementedError (not arbitrary failures), so a future
    # storage-API change surfaces loudly instead of silently disarming cleanup.
    limiter.reset()
    limiter.enabled = True
    yield
    limiter.enabled = False
    limiter.reset()


def test_scrape_rate_limited(mocker, limiter_on):
    """The 3rd call within the window is rejected with 429."""
    mocker.patch("backend.main.check_and_increment_scraper_quota", return_value=True)
    mocker.patch("backend.main.create_run", return_value="test-run-id")
    mocker.patch("backend.main._run_full_pipeline", return_value=True)

    payload = {"city": "New York", "niche": "restaurants"}

    r1 = client.post("/api/scrape", json=payload, headers=HEADERS)
    r2 = client.post("/api/scrape", json=payload, headers=HEADERS)
    r3 = client.post("/api/scrape", json=payload, headers=HEADERS)

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r3.status_code == 429
