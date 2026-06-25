import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_scrape_endpoint_missing_auth():
    response = client.post(
        "/api/scrape", json={"city": "New York", "niche": "restaurants"}
    )
    assert response.status_code == 401


def test_scrape_endpoint_invalid_niche():
    headers = {"x-api-key": "dev-secret-key-123"}
    response = client.post(
        "/api/scrape", json={"city": "New York", "niche": "spaceships"}, headers=headers
    )
    assert response.status_code == 422  # Pydantic validation error


def test_scrape_endpoint_success(mocker):
    # Mocking the background task logic so it doesn't actually hit SerpApi
    # We also mock get_supabase_client because Supabase constructor checks for a valid JWT format for the key
    # We must patch asyncio.to_thread if the underlying methods are mocked properly or better yet, patch the atomic call
    mocker.patch("backend.main.check_and_increment_scraper_quota", return_value=True)
    mocker.patch("backend.main.create_run", return_value="test-run-id")
    mocker.patch("backend.main._run_full_pipeline", return_value=True)

    headers = {"x-api-key": "dev-secret-key-123"}
    response = client.post(
        "/api/scrape",
        json={"city": "New York", "niche": "restaurants"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    assert response.json()["run_id"] == "test-run-id"
