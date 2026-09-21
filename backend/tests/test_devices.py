"""Tests de registro / presencia de dispositivos MC33."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.modules.devices.models import DispositivoMovil


def _payload(device_key: str = "mc33-test-key-001", **overrides) -> dict:
    data = {
        "device_key": device_key,
        "modelo": "MC3300x",
        "fabricante": "Zebra Technologies",
        "numero_serie": "SN12345678",
        "app_version": "0.1.0",
        "android_version": "11",
    }
    data.update(overrides)
    return data


def test_registro_requiere_cliente_mc33(client: TestClient, auth_headers):
    res = client.post("/api/v1/dispositivos/registro", json=_payload(), headers=auth_headers)
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "DEVICE_MOBILE_ONLY"


def test_registro_y_aparece_en_dashboard(client: TestClient, mobile_auth_headers, auth_headers):
    reg = client.post(
        "/api/v1/dispositivos/registro",
        json=_payload("dash-device-1", numero_serie="SN-DASH-1"),
        headers=mobile_auth_headers,
    )
    assert reg.status_code == 200, reg.text
    body = reg.json()
    assert body["modelo"] == "MC3300x"
    assert body["numero_serie"] == "SN-DASH-1"
    assert body["en_linea"] is True
    assert body["sesion_activa"] is True
    assert body["estado"] == "en_linea"
    assert body["usuario_nombre"]

    resumen = client.get("/api/v1/dashboard/resumen", headers=auth_headers)
    assert resumen.status_code == 200
    devices = resumen.json()["dispositivos_moviles"]
    match = next(d for d in devices if d.get("numero_serie") == "SN-DASH-1")
    assert match["en_linea"] is True
    assert match["estado"] == "en_linea"


def test_upsert_mismo_device(client: TestClient, mobile_auth_headers):
    first = client.post(
        "/api/v1/dispositivos/registro",
        json=_payload("upsert-device"),
        headers=mobile_auth_headers,
    )
    assert first.status_code == 200
    user_a = first.json()["usuario_id"]

    second = client.post(
        "/api/v1/dispositivos/registro",
        json=_payload("upsert-device", app_version="0.1.1"),
        headers=mobile_auth_headers,
    )
    assert second.status_code == 200
    assert second.json()["usuario_id"] == user_a
    assert second.json()["app_version"] == "0.1.1"
    assert second.json()["id"] == first.json()["id"]


def test_heartbeat_404_si_no_registrado(client: TestClient, mobile_auth_headers):
    res = client.post(
        "/api/v1/dispositivos/heartbeat",
        json={"device_key": "never-registered"},
        headers=mobile_auth_headers,
    )
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "DEVICE_NOT_REGISTERED"


def test_logout_marca_offline(client: TestClient, mobile_auth_headers, auth_headers):
    client.post(
        "/api/v1/dispositivos/registro",
        json=_payload("logout-device-2", numero_serie="SN-LOGOUT-ONLY"),
        headers=mobile_auth_headers,
    )
    out = client.post(
        "/api/v1/dispositivos/logout",
        json={"device_key": "logout-device-2"},
        headers=mobile_auth_headers,
    )
    assert out.status_code == 200
    assert out.json()["sesion_activa"] is False
    assert out.json()["en_linea"] is False
    assert out.json()["estado"] == "sesion_cerrada"

    resumen = client.get("/api/v1/dashboard/resumen", headers=auth_headers)
    match = next(
        d for d in resumen.json()["dispositivos_moviles"] if d.get("numero_serie") == "SN-LOGOUT-ONLY"
    )
    assert match["en_linea"] is False
    assert match["sesion_activa"] is False
    assert match["estado"] == "sesion_cerrada"


def test_timeout_marca_inactivo(client: TestClient, mobile_auth_headers, auth_headers, monkeypatch):
    from app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("DEVICE_ONLINE_TIMEOUT_SECONDS", "60")
    get_settings.cache_clear()

    client.post(
        "/api/v1/dispositivos/registro",
        json=_payload("stale-device", numero_serie="SN-STALE-ONLY"),
        headers=mobile_auth_headers,
    )

    db = SessionLocal()
    try:
        device = db.scalars(
            select(DispositivoMovil).where(DispositivoMovil.device_key == "stale-device")
        ).first()
        assert device is not None
        device.ultimo_visto_en = datetime.now(UTC) - timedelta(seconds=120)
        db.commit()
    finally:
        db.close()

    resumen = client.get("/api/v1/dashboard/resumen", headers=auth_headers)
    match = next(
        d for d in resumen.json()["dispositivos_moviles"] if d.get("numero_serie") == "SN-STALE-ONLY"
    )
    assert match["en_linea"] is False
    assert match["sesion_activa"] is True
    assert match["estado"] == "inactivo"

    get_settings.cache_clear()


def test_dashboard_no_expone_device_key(client: TestClient, mobile_auth_headers, auth_headers):
    client.post(
        "/api/v1/dispositivos/registro",
        json=_payload("secret-key-xyz", numero_serie="SN-SECRET-KEY"),
        headers=mobile_auth_headers,
    )
    resumen = client.get("/api/v1/dashboard/resumen", headers=auth_headers)
    assert resumen.status_code == 200
    match = next(
        d for d in resumen.json()["dispositivos_moviles"] if d.get("numero_serie") == "SN-SECRET-KEY"
    )
    assert "device_key" not in match
    assert "usuario_email" not in match
    assert "secret-key-xyz" not in resumen.text
