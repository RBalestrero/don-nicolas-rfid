import uuid

from fastapi.testclient import TestClient

from tests.epc_helpers import epc_de_prueba


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
        epc = epc_de_prueba()
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
    assert xfer["estado"] == "completada"
    assert xfer["total_activos"] == 2
    assert len(xfer["detalles"]) == 2
    assert xfer["confirmados_origen"] == 2
    assert xfer["confirmados_destino"] == 2

    # Ya no requiere confirmación
    confirm = client.post(
        f"/api/v1/transferencias/{xfer['id']}/confirmar-origen",
        json={"epcs": setup["epcs"]},
        headers=auth_headers,
    )
    assert confirm.status_code == 409

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
        xfer_entries = [h for h in hist.json() if h["accion"] == "transferencia"]
        assert len(xfer_entries) == 1
        assert xfer_entries[0]["cambios"]["cantidad"] == 1
        assert xfer_entries[0]["cambios"]["deposito_origen"]
        assert xfer_entries[0]["cambios"]["deposito_destino"]
        assert xfer_entries[0]["cambios"]["ubicacion_codigo"] == setup["ubi_destino"]["codigo"]


def test_transferencia_historial_agrega_cantidad(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    activo = setup["activos"][0]
    lote = client.post(
        f"/api/v1/activos/{activo['id']}/etiquetas",
        json={"cantidad": 2},
        headers=auth_headers,
    )
    assert lote.status_code == 201, lote.text
    client.post(
        f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
        json={"ubicacion_id": setup["ubi_origen"]["id"]},
        headers=auth_headers,
    )

    created = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": setup["origen"]["id"],
            "deposito_destino_id": setup["destino"]["id"],
            "ubicacion_destino_id": setup["ubi_destino"]["id"],
            "lineas": [{"activo_id": activo["id"], "cantidad": 2}],
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    xfer = created.json()
    assert xfer["estado"] == "completada"
    assert len(xfer["detalles"]) == 2

    hist = client.get(
        f"/api/v1/activos/{activo['id']}/historial",
        headers=auth_headers,
    ).json()
    xfer_entries = [h for h in hist if h["accion"] == "transferencia"]
    assert len(xfer_entries) == 1
    assert xfer_entries[0]["cambios"]["cantidad"] == 2
    assert xfer_entries[0]["cambios"]["deposito_origen"] == setup["origen"]["nombre"]
    assert xfer_entries[0]["cambios"]["deposito_destino"] == setup["destino"]["nombre"]

    movs = client.get(
        f"/api/v1/movimientos?activo_id={activo['id']}&limit=20",
        headers=auth_headers,
    )
    assert movs.status_code == 200, movs.text
    items = [m for m in movs.json()["items"] if m["accion"] == "transferencia"]
    assert len(items) >= 1
    assert items[0]["cambios"]["cantidad"] == 2


def test_transferencia_rechaza_misma_ubicacion(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    response = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": setup["origen"]["id"],
            "deposito_destino_id": setup["origen"]["id"],
            "ubicacion_destino_id": setup["ubi_origen"]["id"],
            "activo_ids": [setup["activos"][0]["id"]],
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_transferencia_elige_ubicacion_origen(client: TestClient, auth_headers):
    """Se respeta ubicacion_origen_id al tomar unidades."""
    setup = _setup_transfer_base(client, auth_headers)
    dep_id = setup["origen"]["id"]

    created = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": dep_id,
            "deposito_destino_id": setup["destino"]["id"],
            "ubicacion_destino_id": setup["ubi_destino"]["id"],
            "lineas": [
                {
                    "activo_id": setup["activos"][0]["id"],
                    "cantidad": 1,
                    "ubicacion_origen_id": setup["ubi_origen"]["id"],
                }
            ],
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    assert created.json()["estado"] == "completada"
    det = created.json()["detalles"]
    assert len(det) == 1
    assert det[0]["ubicacion_origen_id"] == setup["ubi_origen"]["id"]

    bad = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": dep_id,
            "deposito_destino_id": setup["destino"]["id"],
            "ubicacion_destino_id": setup["ubi_destino"]["id"],
            "lineas": [
                {
                    "activo_id": setup["activos"][1]["id"],
                    "cantidad": 1,
                    "ubicacion_origen_id": setup["ubi_destino"]["id"],
                }
            ],
        },
        headers=auth_headers,
    )
    assert bad.status_code == 400


def test_transferencia_interna_mismo_deposito(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    dep = client.get(f"/api/v1/depositos/{setup['origen']['id']}", headers=auth_headers).json()
    sec_id = dep["sectores"][0]["id"]
    ubi_interna = client.post(
        f"/api/v1/depositos/{setup['origen']['id']}/sectores/{sec_id}/ubicaciones",
        json={"codigo": "ORI-02"},
        headers=auth_headers,
    )
    assert ubi_interna.status_code == 201, ubi_interna.text
    ubi_interna_id = ubi_interna.json()["id"]

    activo = setup["activos"][0]
    created = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": setup["origen"]["id"],
            "deposito_destino_id": setup["origen"]["id"],
            "ubicacion_destino_id": ubi_interna_id,
            "activo_ids": [activo["id"]],
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    assert created.json()["estado"] == "completada"

    ubic = client.get(f"/api/v1/activos/{activo['id']}/ubicacion", headers=auth_headers)
    assert ubic.status_code == 200
    assert ubic.json()["ubicacion_id"] == ubi_interna_id
    assert ubic.json()["deposito_id"] == setup["origen"]["id"]

    hist = client.get(f"/api/v1/activos/{activo['id']}/historial", headers=auth_headers).json()
    assert any(h["accion"] == "transferencia" for h in hist)


def test_transferencia_exige_ubicacion_destino(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    response = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": setup["origen"]["id"],
            "deposito_destino_id": setup["destino"]["id"],
            "activo_ids": [setup["activos"][0]["id"]],
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_transferencia_completada_no_se_cancela(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    xfer = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": setup["origen"]["id"],
            "deposito_destino_id": setup["destino"]["id"],
            "ubicacion_destino_id": setup["ubi_destino"]["id"],
            "activo_ids": [setup["activos"][0]["id"]],
        },
        headers=auth_headers,
    ).json()
    assert xfer["estado"] == "completada"

    cancel = client.post(
        f"/api/v1/transferencias/{xfer['id']}/cancelar",
        json={},
        headers=auth_headers,
    )
    assert cancel.status_code == 409

    lista = client.get("/api/v1/transferencias?limit=20", headers=auth_headers)
    assert lista.status_code == 200
    ids = [t["id"] for t in lista.json()]
    assert xfer["id"] in ids


def test_activo_ya_movido_no_queda_en_origen(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    payload = {
        "deposito_origen_id": setup["origen"]["id"],
        "deposito_destino_id": setup["destino"]["id"],
        "ubicacion_destino_id": setup["ubi_destino"]["id"],
        "activo_ids": [setup["activos"][0]["id"]],
    }
    first = client.post("/api/v1/transferencias", json=payload, headers=auth_headers)
    assert first.status_code == 201
    assert first.json()["estado"] == "completada"
    second = client.post("/api/v1/transferencias", json=payload, headers=auth_headers)
    assert second.status_code == 400
    assert "disponible" in second.json()["detail"].lower() or "origen" in second.json()[
        "detail"
    ].lower()


def test_transferencia_parcial_por_cantidad(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    activo = setup["activos"][0]
    lote = client.post(
        f"/api/v1/activos/{activo['id']}/etiquetas",
        json={"cantidad": 2},
        headers=auth_headers,
    )
    assert lote.status_code == 201, lote.text
    assert lote.json()["stock_etiquetas"] >= 3
    client.post(
        f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
        json={"ubicacion_id": setup["ubi_origen"]["id"]},
        headers=auth_headers,
    )

    created = client.post(
        "/api/v1/transferencias",
        json={
            "deposito_origen_id": setup["origen"]["id"],
            "deposito_destino_id": setup["destino"]["id"],
            "ubicacion_destino_id": setup["ubi_destino"]["id"],
            "lineas": [{"activo_id": activo["id"], "cantidad": 1}],
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    xfer = created.json()
    assert xfer["estado"] == "completada"
    assert xfer["total_activos"] == 1
    assert len(xfer["detalles"]) == 1
    epc_movido = xfer["detalles"][0]["epc"]
    assert epc_movido

    stock_origen = client.get(
        f"/api/v1/depositos/{setup['origen']['id']}/stock",
        headers=auth_headers,
    ).json()
    stock_destino = client.get(
        f"/api/v1/depositos/{setup['destino']['id']}/stock",
        headers=auth_headers,
    ).json()
    unidades_origen = [
        u for u in stock_origen["activos"] if u["activo_id"] == activo["id"]
    ]
    unidades_destino = [
        u for u in stock_destino["activos"] if u["activo_id"] == activo["id"]
    ]
    assert len(unidades_destino) == 1
    assert unidades_destino[0]["epc"] == epc_movido
    assert len(unidades_origen) >= 2
    assert epc_movido not in {u["epc"] for u in unidades_origen}


def test_entrega_persona_completa_en_un_paso(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    persona = client.post(
        "/api/v1/personas",
        json={"nombre": _unique("Juan Perez"), "documento": "30111222"},
        headers=auth_headers,
    )
    assert persona.status_code == 201, persona.text
    persona_id = persona.json()["id"]
    activo = setup["activos"][0]

    created = client.post(
        "/api/v1/transferencias",
        json={
            "tipo": "persona",
            "deposito_origen_id": setup["origen"]["id"],
            "persona_destino_id": persona_id,
            "activo_ids": [activo["id"]],
            "notas": "Entrega operativa",
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    xfer = created.json()
    assert xfer["tipo"] == "persona"
    assert xfer["estado"] == "completada"
    assert xfer["persona_destino_id"] == persona_id
    assert xfer["persona_destino_nombre"]
    assert xfer["deposito_destino_id"] is None
    assert xfer["confirmados_destino"] == xfer["total_activos"]

    ubic = client.get(f"/api/v1/activos/{activo['id']}/ubicacion", headers=auth_headers)
    assert ubic.status_code == 404

    stock_origen = client.get(
        f"/api/v1/depositos/{setup['origen']['id']}/stock",
        headers=auth_headers,
    ).json()
    assert activo["id"] not in {u["activo_id"] for u in stock_origen["activos"]}

    hist = client.get(
        f"/api/v1/activos/{activo['id']}/historial",
        headers=auth_headers,
    ).json()
    entrega_entries = [h for h in hist if h["accion"] == "entrega_persona"]
    assert len(entrega_entries) == 1
    assert entrega_entries[0]["cambios"]["cantidad"] == 1
    assert entrega_entries[0]["cambios"]["persona_nombre"]
    assert entrega_entries[0]["cambios"]["deposito_origen"]

    confirm = client.post(
        f"/api/v1/transferencias/{xfer['id']}/confirmar-origen",
        json={"epcs": setup["epcs"]},
        headers=auth_headers,
    )
    assert confirm.status_code == 409


def test_entrega_persona_parcial_no_duplica_stock(client: TestClient, auth_headers):
    setup = _setup_transfer_base(client, auth_headers)
    activo = setup["activos"][0]
    lote = client.post(
        f"/api/v1/activos/{activo['id']}/etiquetas",
        json={"cantidad": 2},
        headers=auth_headers,
    )
    assert lote.status_code == 201, lote.text

    # Ubicar las nuevas etiquetas en origen
    client.post(
        f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
        json={"ubicacion_id": setup["ubi_origen"]["id"]},
        headers=auth_headers,
    )

    stock_antes = client.get(
        f"/api/v1/depositos/{setup['origen']['id']}/stock",
        headers=auth_headers,
    ).json()
    unidades_antes = [u for u in stock_antes["activos"] if u["activo_id"] == activo["id"]]
    assert len(unidades_antes) >= 3

    persona = client.post(
        "/api/v1/personas",
        json={"nombre": _unique("Maria Lopez")},
        headers=auth_headers,
    ).json()

    created = client.post(
        "/api/v1/transferencias",
        json={
            "tipo": "persona",
            "deposito_origen_id": setup["origen"]["id"],
            "persona_destino_id": persona["id"],
            "lineas": [{"activo_id": activo["id"], "cantidad": 1}],
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    epc_entregado = created.json()["detalles"][0]["epc"]
    assert epc_entregado

    stock_despues = client.get(
        f"/api/v1/depositos/{setup['origen']['id']}/stock",
        headers=auth_headers,
    ).json()
    unidades_despues = [
        u for u in stock_despues["activos"] if u["activo_id"] == activo["id"]
    ]
    assert len(unidades_despues) == len(unidades_antes) - 1
    assert epc_entregado not in {u["epc"] for u in unidades_despues}
