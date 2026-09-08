import uuid

from fastapi.testclient import TestClient


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _setup_transfer_base(client: TestClient, auth_headers: dict) -> dict:
    dep_origen = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep Origen")},
        headers=auth_headers,
    ).json()
    sec_origen = client.post(
        f"/api/v1/depositos/{dep_origen['id']}/sectores",
        json={"nombre": "Sector Origen"},
        headers=auth_headers,
    ).json()
    ubi_origen = client.post(
        f"/api/v1/depositos/{dep_origen['id']}/sectores/{sec_origen['id']}/ubicaciones",
        json={"codigo": "ORI-01"},
        headers=auth_headers,
    ).json()

    dep_destino = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep Destino")},
        headers=auth_headers,
    ).json()
    sec_destino = client.post(
        f"/api/v1/depositos/{dep_destino['id']}/sectores",
        json={"nombre": "Sector Destino"},
        headers=auth_headers,
    ).json()
    ubi_destino = client.post(
        f"/api/v1/depositos/{dep_destino['id']}/sectores/{sec_destino['id']}/ubicaciones",
        json={"codigo": "DST-01"},
        headers=auth_headers,
    ).json()

    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("CatXfer")},
        headers=auth_headers,
    ).json()

    activos = []
    epcs = []
    for i in range(2):
        epc = f"E280XFER{i}{_unique('')[:4]}".upper()
        activo = client.post(
            "/api/v1/activos",
            json={
                "numero_patrimonial": _unique("PAT-X"),
                "descripcion": f"Activo transferible {i}",
                "categoria_id": cat["id"],
                "epc": epc,
            },
            headers=auth_headers,
        ).json()
        client.post(
            f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
            json={"ubicacion_id": ubi_origen["id"]},
            headers=auth_headers,
        )
        activos.append(activo)
        epcs.append(epc)

    return {
        "origen": dep_origen,
        "destino": dep_destino,
        "ubi_origen": ubi_origen,
        "ubi_destino": ubi_destino,
        "activos": activos,
        "epcs": epcs,
    }


def test_transferencia_flujo_completo(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    activo_ids = [a["id"] for a in setup["activos"]]

    created = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": setup["origen"]["id"],
            "deposito_destino_id": setup["destino"]["id"],
            "ubicacion_destino_id": setup["ubi_destino"]["id"],
            "activo_ids": activo_ids,
            "notas": "Mudanza de prueba",
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    xfer = created.json()
    assert xfer["estado"] == "pendiente"
    assert xfer["total_activos"] == 2
    assert len(xfer["detalles"]) == 2

    origen = client.post(
        f"/api/v1/transferencias/{xfer['id']}/confirmar-origen",
        json={"epcs": setup["epcs"]},
        headers=auth_headers,
    )
    assert origen.status_code == 200, origen.text
    assert origen.json()["estado"] == "en_transito"
    assert origen.json()["confirmados_origen"] == 2

    destino = client.post(
        f"/api/v1/transferencias/{xfer['id']}/confirmar-destino",
        json={"epcs": setup["epcs"]},
        headers=auth_headers,
    )
    assert destino.status_code == 200, destino.text
    done = destino.json()
    assert done["estado"] == "completada"
    assert done["confirmados_destino"] == 2

    for activo in setup["activos"]:
        ubic = client.get(
            f"/api/v1/activos/{activo['id']}/ubicacion",
            headers=auth_headers,
        )
        assert ubic.status_code == 200
        assert ubic.json()["ubicacion_id"] == setup["ubi_destino"]["id"]
        assert ubic.json()["deposito_id"] == setup["destino"]["id"]

        hist = client.get(
            f"/api/v1/activos/{activo['id']}/historial",
            headers=auth_headers,
        )
        assert hist.status_code == 200
        acciones = [h["accion"] for h in hist.json()]
        assert "transferencia" in acciones


def test_transferencia_rechaza_mismo_deposito(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    response = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": setup["origen"]["id"],
            "deposito_destino_id": setup["origen"]["id"],
            "activo_ids": [setup["activos"][0]["id"]],
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_transferencia_epcs_incompletos(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    xfer = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": setup["origen"]["id"],
            "deposito_destino_id": setup["destino"]["id"],
            "ubicacion_destino_id": setup["ubi_destino"]["id"],
            "activo_ids": [a["id"] for a in setup["activos"]],
        },
        headers=auth_headers,
    ).json()

    response = client.post(
        f"/api/v1/transferencias/{xfer['id']}/confirmar-origen",
        json={"epcs": [setup["epcs"][0]]},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_transferencia_cancelar_y_listar(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    xfer = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": setup["origen"]["id"],
            "deposito_destino_id": setup["destino"]["id"],
            "activo_ids": [setup["activos"][0]["id"]],
        },
        headers=auth_headers,
    ).json()

    cancel = client.post(
        f"/api/v1/transferencias/{xfer['id']}/cancelar",
        json={},
        headers=auth_headers,
    )
    assert cancel.status_code == 200
    assert cancel.json()["estado"] == "cancelada"

    lista = client.get("/api/v1/transferencias?limit=20", headers=auth_headers)
    assert lista.status_code == 200
    ids = [t["id"] for t in lista.json()]
    assert xfer["id"] in ids


def test_activo_no_puede_estar_en_dos_transferencias_abiertas(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    payload = {
        "deposito_origen_id": setup["origen"]["id"],
        "deposito_destino_id": setup["destino"]["id"],
        "activo_ids": [setup["activos"][0]["id"]],
    }
    first = client.post("/api/v1/transferencias", json=payload, headers=auth_headers)
    assert first.status_code == 201
    second = client.post("/api/v1/transferencias", json=payload, headers=auth_headers)
    assert second.status_code == 409
