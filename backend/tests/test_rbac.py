import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import Settings, validate_security_settings
from app.core.security import hash_password
from app.database import SessionLocal
from app.modules.auth.models import Usuario
from tests.conftest import ADMIN_PASSWORD

OPERADOR_ALTA_EMAIL = "test-op-alta@donnicolas.com"
OPERADOR_ALTA_ROLE_ID = uuid.UUID("00000000-0000-0000-0000-000000000003")
SUPERVISOR_EMAIL = "test-supervisor@donnicolas.com"
SUPERVISOR_ROLE_ID = uuid.UUID("00000000-0000-0000-0000-000000000004")


def _ensure_user(email: str, rol_id: uuid.UUID, nombre: str) -> Usuario:
    db = SessionLocal()
    existing = db.scalars(select(Usuario).where(Usuario.email == email)).first()
    if existing:
        db.delete(existing)
        db.commit()
    user = Usuario(
        id=uuid.uuid4(),
        email=email,
        nombre=nombre,
        password_hash=hash_password(ADMIN_PASSWORD),
        activo=True,
        rol_id=rol_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


def _headers(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": ADMIN_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def operador_alta_headers(client: TestClient):
    _ensure_user(OPERADOR_ALTA_EMAIL, OPERADOR_ALTA_ROLE_ID, "Op Alta")
    yield _headers(client, OPERADOR_ALTA_EMAIL)
    db = SessionLocal()
    user = db.scalars(select(Usuario).where(Usuario.email == OPERADOR_ALTA_EMAIL)).first()
    if user:
        db.delete(user)
        db.commit()
    db.close()


@pytest.fixture
def supervisor_headers(client: TestClient):
    _ensure_user(SUPERVISOR_EMAIL, SUPERVISOR_ROLE_ID, "Supervisor")
    yield _headers(client, SUPERVISOR_EMAIL)
    db = SessionLocal()
    user = db.scalars(select(Usuario).where(Usuario.email == SUPERVISOR_EMAIL)).first()
    if user:
        db.delete(user)
        db.commit()
    db.close()


def test_operador_alta_puede_crear_categoria_pero_no_deposito(
    client: TestClient, operador_alta_headers
):
    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": f"Cat-{uuid.uuid4().hex[:6]}"},
        headers=operador_alta_headers,
    )
    assert cat.status_code == 201, cat.text

    dep = client.post(
        "/api/v1/depositos",
        json={"nombre": f"Dep-{uuid.uuid4().hex[:6]}"},
        headers=operador_alta_headers,
    )
    assert dep.status_code == 403
    assert dep.json()["detail"]["code"] == "FORBIDDEN_PERMISSION"


def test_operador_alta_no_puede_crear_transferencia(client: TestClient, operador_alta_headers):
    response = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": str(uuid.uuid4()),
            "deposito_destino_id": str(uuid.uuid4()),
            "activo_ids": [str(uuid.uuid4())],
            "ubicacion_destino_id": str(uuid.uuid4()),
        },
        headers=operador_alta_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "FORBIDDEN_PERMISSION"


def test_supervisor_puede_leer_dashboard(client: TestClient, supervisor_headers):
    response = client.get("/api/v1/dashboard/resumen", headers=supervisor_headers)
    assert response.status_code == 200


def test_supervisor_no_puede_crear_activo(client: TestClient, supervisor_headers):
    response = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": f"PAT-{uuid.uuid4().hex[:6]}",
            "descripcion": "No permitido",
            "categoria_id": str(uuid.uuid4()),
        },
        headers=supervisor_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "FORBIDDEN_PERMISSION"


def test_production_rejects_weak_secret():
    cfg = Settings(
        app_env="production",
        api_debug=False,
        secret_key="short",
        postgres_password="super-secure-db-password-123",
    )
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validate_security_settings(cfg)


def test_production_rejects_debug_true():
    cfg = Settings(
        app_env="production",
        api_debug=True,
        secret_key="a" * 40,
        postgres_password="super-secure-db-password-123",
    )
    with pytest.raises(RuntimeError, match="API_DEBUG"):
        validate_security_settings(cfg)


def test_production_accepts_strong_config():
    cfg = Settings(
        app_env="production",
        api_debug=False,
        secret_key="a" * 40,
        postgres_password="super-secure-db-password-123",
        expose_api_docs=False,
    )
    validate_security_settings(cfg)
    assert cfg.docs_enabled is False
