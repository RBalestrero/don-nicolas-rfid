import uuid

from fastapi.testclient import TestClient


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _setup_inventario_base(client: TestClient, mobile_auth_headers: dict) -> dict:
    deposito = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep Inv")},
        headers=mobile_auth_headers,
    ).json()
    sector = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores",
        json={"nombre": "Sector Inv"},
        headers=mobile_auth_headers,
    ).json()
    ubic = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores/{sector['id']}/ubicaciones",
        json={"codigo": "INV-01"},
        headers=mobile_auth_headers,
    ).json()
    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("CatInv")},
        headers=mobile_auth_headers,
    ).json()

    def crear_con_epc(desc: str, epc: str) -> dict:
        activo = client.post(
            "/api/v1/activos",
            json={
                "numero_patrimonial": _unique("PAT"),
                "descripcion": desc,
                "categoria_id": cat["id"],
                "epc": epc,
            },
            headers=mobile_auth_headers,
        ).json()
        client.post(
            f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
            json={"ubicacion_id": ubic["id"]},
            headers=mobile_auth_headers,
        )
        return activo

    a1 = crear_con_epc("Activo A", "E200001")
    a2 = crear_con_epc("Activo B", "E200002")
    a3 = crear_con_epc("Activo C", "E200003")

    return {
        "deposito": deposito,
        "sector": sector,
        "ubic": ubic,
        "activos": [a1, a2, a3],
        "epcs": ["E200001", "E200002", "E200003"],
    }


def test_inventario_esperado_vs_leido(client: TestClient, mobile_auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)

    created = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    )
    assert created.status_code == 201
    inv = created.json()
    assert inv["estado"] == "en_curso"
    assert inv["resumen"]["total_esperado"] == 3
    assert inv["resumen"]["total_encontrado"] == 0
    assert len(inv["detalles"]) == 3

    lecturas = client.post(
        f"/api/v1/inventarios/{inv['id']}/lecturas",
        json={"epcs": ["E200001", "E200002", "E299999"]},
        headers=mobile_auth_headers,
    )
    assert lecturas.status_code == 200
    mid = lecturas.json()
    assert mid["resumen"]["total_encontrado"] == 2
    assert mid["resumen"]["total_faltante"] == 1
    assert mid["resumen"]["total_sobrante"] == 1

    cerrado = client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": []},
        headers=mobile_auth_headers,
    )
    assert cerrado.status_code == 200
    result = cerrado.json()
    assert result["estado"] == "cerrado"
    assert result["resumen"]["total_esperado"] == 3
    assert result["resumen"]["total_encontrado"] == 2
    assert result["resumen"]["total_faltante"] == 1
    assert result["resumen"]["total_sobrante"] == 1

    estados = {d["epc"]: d["estado"] for d in result["detalles"]}
    assert estados["E200001"] == "encontrado"
    assert estados["E200002"] == "encontrado"
    assert estados["E200003"] == "faltante"
    assert estados["E299999"] == "sobrante"


def test_inventario_cerrar_con_lecturas_finales(client: TestClient, mobile_auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={
            "deposito_id": setup["deposito"]["id"],
            "sector_id": setup["sector"]["id"],
        },
        headers=mobile_auth_headers,
    ).json()

    cerrado = client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": setup["epcs"]},
        headers=mobile_auth_headers,
    )
    assert cerrado.status_code == 200
    result = cerrado.json()
    assert result["resumen"]["total_encontrado"] == 3
    assert result["resumen"]["total_faltante"] == 0
    assert result["resumen"]["total_sobrante"] == 0


def test_inventario_no_reabre(client: TestClient, mobile_auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(f"/api/v1/inventarios/{inv['id']}/cerrar", json={}, headers=mobile_auth_headers)
    again = client.post(
        f"/api/v1/inventarios/{inv['id']}/lecturas",
        json={"epcs": ["E200001"]},
        headers=mobile_auth_headers,
    )
    assert again.status_code == 409


def test_reporte_discrepancias_y_listado(client: TestClient, mobile_auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": ["E200001", "E299999"]},
        headers=mobile_auth_headers,
    )

    reporte = client.get(f"/api/v1/inventarios/{inv['id']}/reporte", headers=mobile_auth_headers)
    assert reporte.status_code == 200
    data = reporte.json()
    assert data["tiene_discrepancias"] is True
    assert data["coincidencia_pct"] == 33.3
    assert len(data["encontrados"]) == 1
    assert len(data["faltantes"]) == 2
    assert len(data["sobrantes"]) == 1
    assert data["encontrados"][0]["epc"] == "E200001"
    assert {d["epc"] for d in data["faltantes"]} == {"E200002", "E200003"}
    assert data["sobrantes"][0]["epc"] == "E299999"

    lista = client.get(
        "/api/v1/inventarios",
        params={"deposito_id": setup["deposito"]["id"], "estado": "cerrado"},
        headers=mobile_auth_headers,
    )
    assert lista.status_code == 200
    items = lista.json()
    assert len(items) >= 1
    assert items[0]["id"] == inv["id"]
    assert items[0]["total_faltante"] == 2
    assert items[0]["total_sobrante"] == 1


def test_reporte_sin_discrepancias(client: TestClient, mobile_auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    cerrado = client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": setup["epcs"]},
        headers=mobile_auth_headers,
    ).json()
    reporte = client.get(f"/api/v1/inventarios/{cerrado['id']}/reporte", headers=mobile_auth_headers).json()
    assert reporte["tiene_discrepancias"] is False
    assert reporte["coincidencia_pct"] == 100.0
    assert len(reporte["faltantes"]) == 0
    assert len(reporte["sobrantes"]) == 0
    assert len(reporte["encontrados"]) == 3


def test_auditar_inventario_cerrado_desde_web(client: TestClient, mobile_auth_headers, auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": ["E200001"]},
        headers=mobile_auth_headers,
    )

    audited = client.post(
        f"/api/v1/inventarios/{inv['id']}/auditar",
        json={"auditado": True, "comentario": "Faltantes revisados en planta"},
        headers=auth_headers,
    )
    assert audited.status_code == 200
    body = audited.json()
    assert body["auditado"] is True
    assert body["comentario_auditoria"] == "Faltantes revisados en planta"
    assert body["auditado_en"] is not None
    assert body["auditado_por_id"] is not None

    lista = client.get("/api/v1/inventarios", headers=auth_headers).json()
    item = next(i for i in lista if i["id"] == inv["id"])
    assert item["auditado"] is True
    assert item["comentario_auditoria"] == "Faltantes revisados en planta"

    pending = client.post(
        f"/api/v1/inventarios/{inv['id']}/auditar",
        json={"auditado": False, "comentario": None},
        headers=auth_headers,
    )
    assert pending.status_code == 200
    assert pending.json()["auditado"] is False
    assert pending.json()["auditado_en"] is None


def test_auditar_requiere_inventario_cerrado(client: TestClient, mobile_auth_headers, auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    res = client.post(
        f"/api/v1/inventarios/{inv['id']}/auditar",
        json={"auditado": True},
        headers=auth_headers,
    )
    assert res.status_code == 409
