"""Tests for B2 API hardening: input limits + body-size cap."""

from fastapi.testclient import TestClient
from backend.main import app, _MAX_CITY_LENGTH
from backend.config import settings

client = TestClient(app)

HEADERS = {"x-api-key": "dev-secret-key-123"}


def test_oversized_city_rejected():
    """A city longer than the cap fails Pydantic validation (422)."""
    long_city = "x" * (_MAX_CITY_LENGTH + 1)
    response = client.post(
        "/api/scrape",
        json={"city": long_city, "niche": "restaurants"},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_empty_city_rejected():
    """An empty city fails min_length validation (422)."""
    response = client.post(
        "/api/scrape",
        json={"city": "", "niche": "restaurants"},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_body_too_large_rejected():
    """A body over the size cap is shed with 413 before routing/auth."""
    oversized = "a" * (settings.max_request_bytes + 1024)
    response = client.post(
        "/api/scrape",
        json={"city": oversized, "niche": "restaurants"},
        headers=HEADERS,
    )
    assert response.status_code == 413
    assert response.json()["detail"] == "Request body too large"


def test_body_too_large_keeps_cors_headers():
    """The 413 short-circuit still flows through CORS (it is registered inside
    CORSMiddleware), so a cross-origin caller gets a readable error."""
    oversized = "a" * (settings.max_request_bytes + 1024)
    response = client.post(
        "/api/scrape",
        json={"city": oversized, "niche": "restaurants"},
        headers={**HEADERS, "Origin": "http://localhost:3000"},
    )
    assert response.status_code == 413
    assert (
        response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    )
