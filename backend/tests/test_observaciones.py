import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.modules.auth.models import Usuario
from tests.test_rbac import (
    SUPERVISOR_EMAIL,
    SUPERVISOR_ROLE_ID,
    _ensure_user,
    _headers,
)


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


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


@pytest.fixture
def activo_setup(client: TestClient, auth_headers):
    categoria = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Obs")},
        headers=auth_headers,
    ).json()

    activo = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT-OBS"),
            "descripcion": "Activo con observaciones",
            "categoria_id": categoria["id"],
        },
        headers=auth_headers,
    ).json()

    return activo


def test_create_and_list_observaciones(client: TestClient, auth_headers, activo_setup):
    created = client.post(
        f"/api/v1/activos/{activo_setup['id']}/observaciones",
        json={"texto": "Primera nota"},
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["texto"] == "Primera nota"
    assert body["activo_id"] == activo_setup["id"]
    assert body["usuario_nombre"] == "Test Admin"
    assert body["usuario_id"] is not None
    assert body["creado_en"]

    client.post(
        f"/api/v1/activos/{activo_setup['id']}/observaciones",
        json={"texto": "Segunda nota"},
        headers=auth_headers,
    )

    listed = client.get(
        f"/api/v1/activos/{activo_setup['id']}/observaciones",
        headers=auth_headers,
    )
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == 2
    assert items[0]["texto"] == "Segunda nota"
    assert items[1]["texto"] == "Primera nota"


def test_delete_observacion(client: TestClient, auth_headers, activo_setup):
    created = client.post(
        f"/api/v1/activos/{activo_setup['id']}/observaciones",
        json={"texto": "A borrar"},
        headers=auth_headers,
    ).json()

    deleted = client.delete(
        f"/api/v1/activos/{activo_setup['id']}/observaciones/{created['id']}",
        headers=auth_headers,
    )
    assert deleted.status_code == 204

    listed = client.get(
        f"/api/v1/activos/{activo_setup['id']}/observaciones",
        headers=auth_headers,
    ).json()
    assert listed == []


def test_observaciones_requiere_auth(client: TestClient, activo_setup):
    response = client.get(f"/api/v1/activos/{activo_setup['id']}/observaciones")
    assert response.status_code == 401

    create = client.post(
        f"/api/v1/activos/{activo_setup['id']}/observaciones",
        json={"texto": "Sin auth"},
    )
    assert create.status_code == 401


def test_create_observacion_requiere_assets_write(
    client: TestClient, auth_headers, activo_setup, supervisor_headers
):
    denied = client.post(
        f"/api/v1/activos/{activo_setup['id']}/observaciones",
        json={"texto": "Supervisor no escribe"},
        headers=supervisor_headers,
    )
    assert denied.status_code == 403
    assert denied.json()["detail"]["code"] == "FORBIDDEN_PERMISSION"

    listed = client.get(
        f"/api/v1/activos/{activo_setup['id']}/observaciones",
        headers=supervisor_headers,
    )
    assert listed.status_code == 200


def test_delete_observacion_requiere_assets_write(
    client: TestClient, auth_headers, activo_setup, supervisor_headers
):
    created = client.post(
        f"/api/v1/activos/{activo_setup['id']}/observaciones",
        json={"texto": "Protegida"},
        headers=auth_headers,
    ).json()

    denied = client.delete(
        f"/api/v1/activos/{activo_setup['id']}/observaciones/{created['id']}",
        headers=supervisor_headers,
    )
    assert denied.status_code == 403


def test_observacion_activo_inexistente(client: TestClient, auth_headers):
    fake_id = str(uuid.uuid4())
    response = client.get(
        f"/api/v1/activos/{fake_id}/observaciones",
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_observacion_texto_vacio_rechazado(client: TestClient, auth_headers, activo_setup):
    response = client.post(
        f"/api/v1/activos/{activo_setup['id']}/observaciones",
        json={"texto": "   "},
        headers=auth_headers,
    )
    assert response.status_code == 422
