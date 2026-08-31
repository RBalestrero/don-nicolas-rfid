import uuid

import pytest
from fastapi.testclient import TestClient

from app.integrations.zebra.epc_generator import generar_epc
from app.integrations.zebra.zpl_generator import EtiquetaData, generar_zpl_etiqueta


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def test_generar_epc_formato():
    activo_id = uuid.uuid4()
    epc = generar_epc(activo_id)
    assert epc.startswith("E280")
    assert len(epc) == 24
    assert epc == epc.upper()


def test_zpl_contiene_datos_etiqueta():
    zpl = generar_zpl_etiqueta(
        EtiquetaData(
            numero_patrimonial="PAT-100",
            descripcion="Monitor LED",
            epc="E2801160600002038F4259D2",
            categoria="Equipos IT",
        )
    )
    assert "^XA" in zpl
    assert "^XZ" in zpl
    assert "PAT-100" in zpl
    assert "Monitor LED" in zpl
    assert "E2801160600002038F4259D2" in zpl
    assert "^RFW" in zpl
    assert "^BQN" in zpl
    assert "^BCN" in zpl


@pytest.fixture
def activo_sin_epc(client: TestClient, auth_headers):
    categoria = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Print")},
        headers=auth_headers,
    ).json()

    activo = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT-PRINT"),
            "descripcion": "Activo para imprimir",
            "categoria_id": categoria["id"],
        },
        headers=auth_headers,
    ).json()
    return activo


def test_imprimir_etiqueta_modo_simulacion(client: TestClient, auth_headers, activo_sin_epc):
    response = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/imprimir-etiqueta",
        json={"copias": 1},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["modo_simulacion"] is True
    assert data["impreso"] is True
    assert data["epc_asignado"] is True
    assert data["epc"].startswith("E280")
    assert data["zpl"] is not None
    assert "^RFW" in data["zpl"]


def test_imprimir_etiqueta_registra_historial(client: TestClient, auth_headers, activo_sin_epc):
    client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/imprimir-etiqueta",
        headers=auth_headers,
    )

    historial = client.get(
        f"/api/v1/activos/{activo_sin_epc['id']}/historial",
        headers=auth_headers,
    ).json()

    assert any(h["accion"] == "etiqueta_impresa" for h in historial)


def test_imprimir_etiqueta_requiere_auth(client: TestClient, activo_sin_epc):
    response = client.post(f"/api/v1/activos/{activo_sin_epc['id']}/imprimir-etiqueta")
    assert response.status_code == 401


def test_imprimir_etiqueta_no_reasigna_epc(client: TestClient, auth_headers, activo_sin_epc):
    first = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/imprimir-etiqueta",
        headers=auth_headers,
    ).json()

    second = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/imprimir-etiqueta",
        headers=auth_headers,
    ).json()

    assert first["epc"] == second["epc"]
    assert second["epc_asignado"] is False
