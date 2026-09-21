import uuid

import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from app.integrations.zebra.epc_generator import (
    decode_epc,
    encode_epc,
    generar_epc,
    pertenece_al_sistema,
)
from app.integrations.zebra.printer_client import ZebraPrinterClient, ZebraPrinterError
from app.integrations.zebra.zpl_generator import EtiquetaData, generar_zpl_etiqueta, generar_zpl_lote


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def test_generar_epc_formato_d1_con_sufijo():
    activo_id = uuid.uuid4()
    epc = generar_epc(activo_id, "PAT-1001")
    assert epc.startswith("D1")
    assert epc.endswith("A1")
    assert len(epc) == 24
    assert pertenece_al_sistema(epc)
    decoded = decode_epc(epc)
    assert decoded.articulo_code == 1001
    assert decoded.serial_hex is not None
    assert len(decoded.serial_hex) == 10
    assert decoded.system_suffix == "A1"
    assert decoded.del_sistema is True


def test_generar_epc_serial_unico_mismo_articulo():
    a = generar_epc("x", "PAT-42")
    b = generar_epc("y", "PAT-42")
    assert decode_epc(a).articulo_code == decode_epc(b).articulo_code == 42
    assert a != b
    assert a.endswith("A1") and b.endswith("A1")


def test_encode_decode_roundtrip():
    epc = encode_epc(1001, 0xABCDEF1234)
    decoded = decode_epc(epc)
    assert decoded.articulo_code == 1001
    assert decoded.serial == 0xABCDEF1234
    assert epc.endswith("A1")


def test_pertenece_al_sistema_rechaza_ajenos():
    assert not pertenece_al_sistema("E2801160600002038F4259D2")
    assert pertenece_al_sistema("D100000003E900ABCDEF12A1")
    assert pertenece_al_sistema(encode_epc(1, 1))
    assert encode_epc(1, 1).endswith("A1")


def test_zpl_lote_multiples_epc():
    zpl = generar_zpl_lote(
        [
            EtiquetaData("PAT-1", "A", "D100000000010000000001A1"),
            EtiquetaData("PAT-1", "A", "D100000000010000000002A1"),
        ]
    )
    assert zpl.count("^XA") == 2
    assert "D100000000010000000001A1" in zpl
    assert "D100000000010000000002A1" in zpl


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


def test_crear_lote_etiquetas_incrementa_stock(client: TestClient, auth_headers, activo_sin_epc):
    response = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/etiquetas",
        json={"cantidad": 3},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["cantidad"] == 3
    assert data["stock_etiquetas"] == 3
    assert len(data["etiquetas"]) == 3
    epcs = {e["epc"] for e in data["etiquetas"]}
    assert len(epcs) == 3
    for e in data["etiquetas"]:
        assert e["epc"].startswith("D1")
        assert e["decodificado"]["scheme"] == "D1"

    articulo = client.get(
        f"/api/v1/activos/{activo_sin_epc['id']}",
        headers=auth_headers,
    ).json()
    assert articulo["stock_etiquetas"] == 3


def test_imprimir_lote_etiquetas(client: TestClient, auth_headers, activo_sin_epc):
    response = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/imprimir-etiquetas",
        json={"cantidad": 2},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["impreso"] is True
    assert data["modo_simulacion"] is True
    assert data["cantidad"] == 2
    assert data["zpl"] is not None
    assert data["zpl"].count("^RFW") == 2


def test_reposicion_no_aumenta_stock(client: TestClient, auth_headers, activo_sin_epc):
    creado = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/etiquetas",
        json={"cantidad": 3},
        headers=auth_headers,
    ).json()
    assert creado["stock_etiquetas"] == 3
    epcs_antes = {e["epc"] for e in creado["etiquetas"]}

    response = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/imprimir-etiquetas",
        json={"cantidad": 2, "modo": "reposicion"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["cantidad"] == 2
    assert data["stock_etiquetas"] == 3
    assert data["impreso"] is True
    epcs_repos = {e["epc"] for e in data["etiquetas"]}
    assert epcs_repos.issubset(epcs_antes)

    articulo = client.get(
        f"/api/v1/activos/{activo_sin_epc['id']}",
        headers=auth_headers,
    ).json()
    assert articulo["stock_etiquetas"] == 3


def test_reposicion_sin_stock(client: TestClient, auth_headers, activo_sin_epc):
    response = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/imprimir-etiquetas",
        json={"cantidad": 1, "modo": "reposicion"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "reponer" in response.json()["detail"].lower()


def test_reposicion_en_codificar_rechazada(client: TestClient, auth_headers, activo_sin_epc):
    client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/etiquetas",
        json={"cantidad": 1},
        headers=auth_headers,
    )
    response = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/etiquetas",
        json={"cantidad": 1, "modo": "reposicion"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "impresión" in response.json()["detail"].lower()


def test_dar_baja_etiqueta_reduce_stock(client: TestClient, auth_headers, activo_sin_epc):
    lote = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/etiquetas",
        json={"cantidad": 2},
        headers=auth_headers,
    ).json()
    assert lote["stock_etiquetas"] == 2
    etiqueta_id = lote["etiquetas"][0]["id"]

    response = client.delete(
        f"/api/v1/activos/{activo_sin_epc['id']}/etiquetas/{etiqueta_id}",
        headers=auth_headers,
    )
    assert response.status_code == 204

    articulo = client.get(
        f"/api/v1/activos/{activo_sin_epc['id']}",
        headers=auth_headers,
    ).json()
    assert articulo["stock_etiquetas"] == 1

    listado = client.get(
        f"/api/v1/etiquetas?activo_id={activo_sin_epc['id']}",
        headers=auth_headers,
    ).json()
    assert len(listado) == 1
    assert all(r["id"] != etiqueta_id for r in listado)


def test_list_etiquetas(client: TestClient, auth_headers, activo_sin_epc):
    client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/etiquetas",
        json={"cantidad": 2},
        headers=auth_headers,
    )
    response = client.get("/api/v1/etiquetas", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()
    assert any(r["activo_id"] == activo_sin_epc["id"] for r in rows)


def test_lookup_by_epc_via_etiqueta(client: TestClient, auth_headers, activo_sin_epc):
    lote = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/etiquetas",
        json={"cantidad": 1},
        headers=auth_headers,
    ).json()
    epc = lote["etiquetas"][0]["epc"]
    response = client.get(f"/api/v1/activos/by-epc/{epc}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["encontrado"] is True
    assert data["activo"]["id"] == activo_sin_epc["id"]


def test_imprimir_etiqueta_legacy_crea_unidades(client: TestClient, auth_headers, activo_sin_epc):
    first = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/imprimir-etiqueta",
        json={"copias": 2},
        headers=auth_headers,
    ).json()
    assert first["cantidad"] == 2
    assert first["stock_etiquetas"] == 2

    second = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/imprimir-etiqueta",
        json={"copias": 1},
        headers=auth_headers,
    ).json()
    assert second["stock_etiquetas"] == 3
    assert first["epc"] != second["epc"]


def test_codificar_etiqueta_crea_unidad(client: TestClient, auth_headers, activo_sin_epc):
    response = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/codificar-etiqueta",
        json={"cantidad": 1},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["epc_asignado"] is True
    assert data["epc"].startswith("D1")
    assert data["stock_etiquetas"] == 1


def test_imprimir_falla_no_deja_etiquetas(client: TestClient, auth_headers, activo_sin_epc):
    mock_cfg = MagicMock(simulate=False, host="192.168.1.20", port=9100, timeout=5)
    with (
        patch(
            "app.modules.assets.impresion_service.get_printer_config",
            return_value=mock_cfg,
        ),
        patch.object(
            ZebraPrinterClient,
            "send",
            side_effect=ZebraPrinterError("impresora offline"),
        ),
    ):
        response = client.post(
            f"/api/v1/activos/{activo_sin_epc['id']}/imprimir-etiquetas",
            json={"cantidad": 2},
            headers=auth_headers,
        )
    assert response.status_code == 503
    listado = client.get(
        f"/api/v1/etiquetas?activo_id={activo_sin_epc['id']}",
        headers=auth_headers,
    ).json()
    assert listado == []


def test_imprimir_etiqueta_requiere_auth(client: TestClient, activo_sin_epc):
    response = client.post(f"/api/v1/activos/{activo_sin_epc['id']}/imprimir-etiqueta")
    assert response.status_code == 401


def test_zpl_contiene_datos_etiqueta():
    zpl = generar_zpl_etiqueta(
        EtiquetaData(
            numero_patrimonial="PAT-100",
            descripcion="Monitor LED",
            epc="D100000003E900ABCDEF12A1",
            categoria="Equipos IT",
        )
    )
    assert "^RFW" in zpl
    assert "PAT-100" in zpl
    assert "A1" in zpl


def test_zpl_incluye_serie_fisica_opcional():
    zpl = generar_zpl_etiqueta(
        EtiquetaData(
            numero_patrimonial="PAT-100",
            descripcion="Monitor LED",
            epc="D100000003E900ABCDEF12A1",
            categoria="Equipos IT",
            serie_fisica="SN-FAB-001",
        )
    )
    assert "S/N: SN-FAB-001" in zpl


def test_articulo_serializado_exige_series_fisicas(
    client: TestClient, auth_headers, activo_sin_epc
):
    upd = client.put(
        f"/api/v1/activos/{activo_sin_epc['id']}",
        json={"serializado": True},
        headers=auth_headers,
    )
    assert upd.status_code == 200
    assert upd.json()["serializado"] is True

    sin_series = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/etiquetas",
        json={"cantidad": 2},
        headers=auth_headers,
    )
    assert sin_series.status_code == 400

    ok = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/etiquetas",
        json={
            "cantidad": 2,
            "series_fisicas": ["sn-aaa", "sn-bbb"],
        },
        headers=auth_headers,
    )
    assert ok.status_code == 201
    data = ok.json()
    assert data["cantidad"] == 2
    series = {e["serie_fisica"] for e in data["etiquetas"]}
    assert series == {"SN-AAA", "SN-BBB"}
    # EPC format unchanged
    for e in data["etiquetas"]:
        assert e["epc"].startswith("D1")
        assert e["epc"].endswith("A1")

    dup = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/etiquetas",
        json={"cantidad": 1, "series_fisicas": ["SN-AAA"]},
        headers=auth_headers,
    )
    assert dup.status_code == 409

    lookup = client.get(
        "/api/v1/activos/by-serie-fisica/sn-bbb",
        headers=auth_headers,
    )
    assert lookup.status_code == 200
    body = lookup.json()
    assert body["encontrado"] is True
    assert body["serie_consultada"] == "SN-BBB"
    assert body["activo"]["id"] == activo_sin_epc["id"]
    assert body["epc"] is not None


def test_articulo_no_serializado_rechaza_series(
    client: TestClient, auth_headers, activo_sin_epc
):
    response = client.post(
        f"/api/v1/activos/{activo_sin_epc['id']}/etiquetas",
        json={"cantidad": 1, "series_fisicas": ["NO-DEBE"]},
        headers=auth_headers,
    )
    assert response.status_code == 400
