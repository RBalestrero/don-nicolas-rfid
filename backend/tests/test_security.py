from fastapi.testclient import TestClient

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD


def test_inventario_write_requiere_cliente_mc33(client: TestClient, auth_headers, admin_user):
    # Sin X-Client no se puede crear inventario (web).
    response = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": "00000000-0000-0000-0000-000000000099"},
        headers=auth_headers,
    )
    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["code"] == "INVENTORY_MOBILE_ONLY"


def test_security_headers_present(client: TestClient):
    response = client.get("/api/v1/health")
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


def test_login_lockout_after_failures(client: TestClient, admin_user):
    for _ in range(5):
        bad = client.post(
            "/api/v1/auth/login",
            json={"email": ADMIN_EMAIL, "password": "wrong-password"},
        )
        assert bad.status_code == 401

    locked = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert locked.status_code == 429
    detail = locked.json()["detail"]
    assert detail["code"] == "AUTH_LOCKED"


def test_login_password_too_long_rejected(client: TestClient, admin_user):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": "x" * 200},
    )
    assert response.status_code == 422
