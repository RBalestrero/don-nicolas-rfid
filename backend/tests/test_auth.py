import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.modules.auth.models import Usuario

ADMIN_EMAIL = "test-admin@donnicolas.com"
ADMIN_PASSWORD = "testpass123"
ADMIN_ROLE_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest.fixture
def admin_user():
    db = SessionLocal()
    existing = db.scalars(select(Usuario).where(Usuario.email == ADMIN_EMAIL)).first()
    if existing:
        db.delete(existing)
        db.commit()

    user = Usuario(
        id=uuid.uuid4(),
        email=ADMIN_EMAIL,
        nombre="Test Admin",
        password_hash=hash_password(ADMIN_PASSWORD),
        activo=True,
        rol_id=ADMIN_ROLE_ID,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user
    db.delete(user)
    db.commit()
    db.close()


def test_login_success(client: TestClient, admin_user):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_invalid_credentials(client: TestClient, admin_user):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": "wrongpassword"},
    )
    assert response.status_code == 401


def test_me_endpoint(client: TestClient, admin_user):
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    token = login_response.json()["access_token"]

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == ADMIN_EMAIL
    assert data["rol"] == "admin"
