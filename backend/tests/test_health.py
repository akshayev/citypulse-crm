import backend.main as main
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _restore_dlq_heartbeat():
    """Snapshot/restore the module global these tests mutate, so the readiness
    tests stay self-contained regardless of ordering or future additions."""
    saved = main._dlq_last_beat
    yield
    main._dlq_last_beat = saved


def test_read_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "citypulse-crm-backend"}


def test_readiness_ok(mocker):
    """DB reachable + fresh DLQ heartbeat → 200 ready."""
    mocker.patch("backend.main._db_ping", return_value=None)
    main._dlq_last_beat = main.time.monotonic()

    response = client.get("/api/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"] == {"db": True, "dlq_worker": True}


def test_readiness_db_down(mocker):
    """DB unreachable → 503 not_ready, db check False."""
    mocker.patch("backend.main._db_ping", side_effect=Exception("connection refused"))
    main._dlq_last_beat = main.time.monotonic()

    response = client.get("/api/health/ready")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["db"] is False


def test_readiness_dlq_stale(mocker):
    """A stale DLQ heartbeat → 503 even when the DB is fine."""
    mocker.patch("backend.main._db_ping", return_value=None)
    # Push the heartbeat well past the staleness window.
    main._dlq_last_beat = (
        main.time.monotonic() - main.settings.dlq_heartbeat_max_age_seconds - 10
    )

    response = client.get("/api/health/ready")
    assert response.status_code == 503
    assert response.json()["checks"]["dlq_worker"] is False
