import uuid

from fastapi.testclient import TestClient


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _setup_deposito_con_stock(client: TestClient, auth_headers: dict) -> dict:
    """Crea depósito con 2 sectores, 3 ubicaciones y 4 activos asignados."""
    deposito = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep Consulta")},
        headers=auth_headers,
    ).json()

    sector_a = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores",
        json={"nombre": "Sector A"},
        headers=auth_headers,
    ).json()
    sector_b = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores",
        json={"nombre": "Sector B"},
        headers=auth_headers,
    ).json()

    ubic_a1 = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores/{sector_a['id']}/ubicaciones",
        json={"codigo": "A-01"},
        headers=auth_headers,
    ).json()
    ubic_a2 = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores/{sector_a['id']}/ubicaciones",
        json={"codigo": "A-02"},
        headers=auth_headers,
    ).json()
    ubic_b1 = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores/{sector_b['id']}/ubicaciones",
        json={"codigo": "B-01"},
        headers=auth_headers,
    ).json()

    cat_it = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("IT")},
        headers=auth_headers,
    ).json()
    cat_mob = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Mob")},
        headers=auth_headers,
    ).json()

    def crear_activo(desc: str, cat_id: str, ubic_id: str) -> dict:
        activo = client.post(
            "/api/v1/activos",
            json={
                "numero_patrimonial": _unique("PAT"),
                "descripcion": desc,
                "categoria_id": cat_id,
            },
            headers=auth_headers,
        ).json()
        client.post(
            f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
            json={"ubicacion_id": ubic_id},
            headers=auth_headers,
        )
        return activo

    activos = [
        crear_activo("Notebook Dell Latitude", cat_it["id"], ubic_a1["id"]),
        crear_activo("Monitor LED 27", cat_it["id"], ubic_a1["id"]),
        crear_activo("Escritorio ejecutivo", cat_mob["id"], ubic_a2["id"]),
        crear_activo("Silla ergonómica", cat_mob["id"], ubic_b1["id"]),
    ]

    return {
        "deposito": deposito,
        "sector_a": sector_a,
        "sector_b": sector_b,
        "ubic_a1": ubic_a1,
        "ubic_a2": ubic_a2,
        "ubic_b1": ubic_b1,
        "cat_it": cat_it,
        "cat_mob": cat_mob,
        "activos": activos,
    }


def test_stock_deposito_total(client: TestClient, auth_headers):
    setup = _setup_deposito_con_stock(client, auth_headers)
    deposito_id = setup["deposito"]["id"]

    response = client.get(f"/api/v1/depositos/{deposito_id}/stock", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 4
    assert data["deposito_id"] == deposito_id
    assert len(data["por_sector"]) == 2
    assert len(data["activos"]) == 4

    totales_sector = {s["sector_nombre"]: s["total"] for s in data["por_sector"]}
    assert totales_sector["Sector A"] == 3
    assert totales_sector["Sector B"] == 1


def test_stock_filtro_sector(client: TestClient, auth_headers):
    setup = _setup_deposito_con_stock(client, auth_headers)
    deposito_id = setup["deposito"]["id"]
    sector_a_id = setup["sector_a"]["id"]

    response = client.get(
        f"/api/v1/depositos/{deposito_id}/stock?sector_id={sector_a_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert all(a["sector_id"] == sector_a_id for a in data["activos"])
    assert len(data["por_sector"]) == 1


def test_stock_filtro_ubicacion(client: TestClient, auth_headers):
    setup = _setup_deposito_con_stock(client, auth_headers)
    deposito_id = setup["deposito"]["id"]
    ubic_a1_id = setup["ubic_a1"]["id"]

    response = client.get(
        f"/api/v1/depositos/{deposito_id}/stock?ubicacion_id={ubic_a1_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert all(a["ubicacion_id"] == ubic_a1_id for a in data["activos"])


def test_stock_filtro_categoria(client: TestClient, auth_headers):
    setup = _setup_deposito_con_stock(client, auth_headers)
    deposito_id = setup["deposito"]["id"]
    cat_it_id = setup["cat_it"]["id"]

    response = client.get(
        f"/api/v1/depositos/{deposito_id}/stock?categoria_id={cat_it_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert all(a["categoria_id"] == cat_it_id for a in data["activos"])


def test_stock_filtro_search(client: TestClient, auth_headers):
    setup = _setup_deposito_con_stock(client, auth_headers)
    deposito_id = setup["deposito"]["id"]

    response = client.get(
        f"/api/v1/depositos/{deposito_id}/stock?search=Notebook",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert "Notebook" in data["activos"][0]["descripcion"]


def test_stock_correcto_tras_movimiento(client: TestClient, auth_headers):
    setup = _setup_deposito_con_stock(client, auth_headers)
    deposito_id = setup["deposito"]["id"]
    activo = setup["activos"][0]
    ubic_b1_id = setup["ubic_b1"]["id"]
    ubic_a1_id = setup["ubic_a1"]["id"]

    stock_antes = client.get(
        f"/api/v1/depositos/{deposito_id}/stock?ubicacion_id={ubic_a1_id}",
        headers=auth_headers,
    ).json()
    assert stock_antes["total"] == 2

    # Mover activo de A-01 a B-01
    client.post(
        f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
        json={"ubicacion_id": ubic_b1_id},
        headers=auth_headers,
    )

    stock_a1 = client.get(
        f"/api/v1/depositos/{deposito_id}/stock?ubicacion_id={ubic_a1_id}",
        headers=auth_headers,
    ).json()
    assert stock_a1["total"] == 1

    stock_b1 = client.get(
        f"/api/v1/depositos/{deposito_id}/stock?ubicacion_id={ubic_b1_id}",
        headers=auth_headers,
    ).json()
    assert stock_b1["total"] == 2

    stock_total = client.get(
        f"/api/v1/depositos/{deposito_id}/stock",
        headers=auth_headers,
    ).json()
    assert stock_total["total"] == 4
    totales = {s["sector_nombre"]: s["total"] for s in stock_total["por_sector"]}
    assert totales["Sector A"] == 2
    assert totales["Sector B"] == 2


def test_stock_deposito_inexistente(client: TestClient, auth_headers):
    response = client.get(
        f"/api/v1/depositos/{uuid.uuid4()}/stock",
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_stock_requires_auth(client: TestClient):
    response = client.get(f"/api/v1/depositos/{uuid.uuid4()}/stock")
    assert response.status_code == 401
