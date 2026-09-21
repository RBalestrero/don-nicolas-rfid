from fastapi.testclient import TestClient

from tests.test_rbac import (
    OPERADOR_ALTA_EMAIL,
    OPERADOR_ALTA_ROLE_ID,
    _ensure_user,
    _headers,
)


def test_get_impresora_config(client: TestClient, auth_headers):
    response = client.get("/api/v1/config/impresora", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "host" in data
    assert "port" in data
    assert "simulate" in data
    assert data["port"] == 9100 or isinstance(data["port"], int)


def test_update_impresora_config(client: TestClient, auth_headers):
    response = client.put(
        "/api/v1/config/impresora",
        json={
            "host": "192.168.1.20",
            "port": 9100,
            "simulate": True,
            "timeout": 5,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["host"] == "192.168.1.20"
    assert data["port"] == 9100
    assert data["simulate"] is True
    assert data["fuente"] == "database"

    again = client.get("/api/v1/config/impresora", headers=auth_headers).json()
    assert again["host"] == "192.168.1.20"


def test_update_impresora_requiere_auth(client: TestClient):
    response = client.put(
        "/api/v1/config/impresora",
        json={"host": "10.0.0.1"},
    )
    assert response.status_code == 401


def test_update_impresora_rechaza_host_metadata(client: TestClient, auth_headers):
    response = client.put(
        "/api/v1/config/impresora",
        json={"host": "169.254.169.254", "port": 9100},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_update_impresora_solo_admin(client: TestClient):
    _ensure_user(OPERADOR_ALTA_EMAIL, OPERADOR_ALTA_ROLE_ID, "Op Alta")
    headers = _headers(client, OPERADOR_ALTA_EMAIL)
    response = client.put(
        "/api/v1/config/impresora",
        json={"host": "192.168.1.50", "simulate": True},
        headers=headers,
    )
    assert response.status_code == 403


def test_get_impresora_operador_alta_ok(client: TestClient):
    _ensure_user(OPERADOR_ALTA_EMAIL, OPERADOR_ALTA_ROLE_ID, "Op Alta")
    headers = _headers(client, OPERADOR_ALTA_EMAIL)
    response = client.get("/api/v1/config/impresora", headers=headers)
    assert response.status_code == 200


def test_impresora_estado_simulacion(client: TestClient, auth_headers):
    client.put(
        "/api/v1/config/impresora",
        json={"host": "192.168.1.20", "port": 9100, "simulate": True, "timeout": 2},
        headers=auth_headers,
    )
    response = client.get("/api/v1/config/impresora/estado", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "simulated"
    assert data["simulate"] is True
    assert "simulación" in data["mensaje"].lower()


def test_parse_hqes_media_out():
    from app.integrations.zebra.printer_client import (
        PrinterProbeStatus,
        ZebraPrinterClient,
    )

    text = "PRINTER STATUS\nERRORS: 1 00000000 00000001\nWARNINGS: 0 00000000 00000000\n"
    assert ZebraPrinterClient._parse_hqes(text) == PrinterProbeStatus.PAPER_OUT
    ready = "PRINTER STATUS\nERRORS: 0 00000000 00000000\nWARNINGS: 0 00000000 00000000\n"
    assert ZebraPrinterClient._parse_hqes(ready) == PrinterProbeStatus.READY
    head = "ERRORS: 1 00000000 00000004\nWARNINGS: 0 00000000 00000000"
    assert ZebraPrinterClient._parse_hqes(head) == PrinterProbeStatus.HEAD_OPEN
