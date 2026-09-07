import uuid

from fastapi.testclient import TestClient


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _setup_inventario_base(client: TestClient, auth_headers: dict) -> dict:
    deposito = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep Inv")},
        headers=auth_headers,
    ).json()
    sector = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores",
        json={"nombre": "Sector Inv"},
        headers=auth_headers,
    ).json()
    ubic = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores/{sector['id']}/ubicaciones",
        json={"codigo": "INV-01"},
        headers=auth_headers,
    ).json()
    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("CatInv")},
        headers=auth_headers,
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
            headers=auth_headers,
        ).json()
        client.post(
            f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
            json={"ubicacion_id": ubic["id"]},
            headers=auth_headers,
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


def test_inventario_esperado_vs_leido(client: TestClient, auth_headers):
    setup = _setup_inventario_base(client, auth_headers)

    created = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=auth_headers,
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
        headers=auth_headers,
    )
    assert lecturas.status_code == 200
    mid = lecturas.json()
    assert mid["resumen"]["total_encontrado"] == 2
    assert mid["resumen"]["total_faltante"] == 1
    assert mid["resumen"]["total_sobrante"] == 1

    cerrado = client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": []},
        headers=auth_headers,
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


def test_inventario_cerrar_con_lecturas_finales(client: TestClient, auth_headers):
    setup = _setup_inventario_base(client, auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={
            "deposito_id": setup["deposito"]["id"],
            "sector_id": setup["sector"]["id"],
        },
        headers=auth_headers,
    ).json()

    cerrado = client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": setup["epcs"]},
        headers=auth_headers,
    )
    assert cerrado.status_code == 200
    result = cerrado.json()
    assert result["resumen"]["total_encontrado"] == 3
    assert result["resumen"]["total_faltante"] == 0
    assert result["resumen"]["total_sobrante"] == 0


def test_inventario_no_reabre(client: TestClient, auth_headers):
    setup = _setup_inventario_base(client, auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=auth_headers,
    ).json()
    client.post(f"/api/v1/inventarios/{inv['id']}/cerrar", json={}, headers=auth_headers)
    again = client.post(
        f"/api/v1/inventarios/{inv['id']}/lecturas",
        json={"epcs": ["E200001"]},
        headers=auth_headers,
    )
    assert again.status_code == 409
