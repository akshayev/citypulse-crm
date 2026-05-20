from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_read_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "citypulse-crm-backend"}
