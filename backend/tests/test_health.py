def test_health_check_returns_200(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200


def test_health_check_response_structure(client):
    response = client.get("/api/v1/health")
    data = response.json()

    assert data["service"] == "don-nicolas-rfid-api"
    assert data["version"] == "0.1.0"
    assert data["status"] in ("ok", "degraded")
    assert data["database"] in ("connected", "disconnected")
