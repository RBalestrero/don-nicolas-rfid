import io
import uuid

import pytest
from fastapi.testclient import TestClient

PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@pytest.fixture
def activo_setup(client: TestClient, auth_headers):
    categoria = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Hist")},
        headers=auth_headers,
    ).json()

    activo = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT-HIST"),
            "descripcion": "Activo original",
            "categoria_id": categoria["id"],
        },
        headers=auth_headers,
    ).json()

    return activo


def test_historial_registra_creacion(client: TestClient, auth_headers, activo_setup):
    response = client.get(
        f"/api/v1/activos/{activo_setup['id']}/historial",
        headers=auth_headers,
    )
    assert response.status_code == 200
    historial = response.json()
    assert len(historial) >= 1
    creacion = next(h for h in historial if h["accion"] == "creacion")
    assert creacion["usuario_nombre"] == "Test Admin"
    assert creacion["cambios"]["numero_patrimonial"] == activo_setup["numero_patrimonial"]


def test_historial_registra_actualizacion(client: TestClient, auth_headers, activo_setup):
    client.put(
        f"/api/v1/activos/{activo_setup['id']}",
        json={"descripcion": "Descripción actualizada"},
        headers=auth_headers,
    )

    response = client.get(
        f"/api/v1/activos/{activo_setup['id']}/historial",
        headers=auth_headers,
    )
    historial = response.json()
    actualizacion = next(h for h in historial if h["accion"] == "actualizacion")
    assert actualizacion["cambios"]["descripcion"]["anterior"] == "Activo original"
    assert actualizacion["cambios"]["descripcion"]["nuevo"] == "Descripción actualizada"


def test_historial_desaparece_al_eliminar_activo(client: TestClient, auth_headers, activo_setup):
    client.delete(f"/api/v1/activos/{activo_setup['id']}", headers=auth_headers)

    response = client.get(
        f"/api/v1/activos/{activo_setup['id']}/historial",
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_historial_registra_fotografia(client: TestClient, auth_headers, activo_setup):
    client.post(
        f"/api/v1/activos/{activo_setup['id']}/fotografias",
        headers=auth_headers,
        files={"file": ("foto.png", io.BytesIO(PNG_1x1), "image/png")},
    )

    response = client.get(
        f"/api/v1/activos/{activo_setup['id']}/historial",
        headers=auth_headers,
    )
    historial = response.json()
    assert any(h["accion"] == "foto_agregada" for h in historial)


def test_historial_requiere_auth(client: TestClient, activo_setup):
    response = client.get(f"/api/v1/activos/{activo_setup['id']}/historial")
    assert response.status_code == 401
