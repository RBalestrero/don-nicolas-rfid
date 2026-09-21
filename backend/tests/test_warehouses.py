import uuid

from fastapi.testclient import TestClient


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def test_depositos_requires_auth(client: TestClient):
    response = client.get("/api/v1/depositos")
    assert response.status_code == 401


def test_jerarquia_deposito_sector_ubicacion(client: TestClient, auth_headers):
    nombre_deposito = _unique("Depósito Central")
    deposito_response = client.post(
        "/api/v1/depositos",
        json={
            "nombre": nombre_deposito,
            "descripcion": "Depósito principal",
            "direccion": "Av. Principal 123",
        },
        headers=auth_headers,
    )
    assert deposito_response.status_code == 201
    deposito = deposito_response.json()
    deposito_id = deposito["id"]
    assert deposito["nombre"] == nombre_deposito
    assert deposito["activo"] is True

    sector_response = client.post(
        f"/api/v1/depositos/{deposito_id}/sectores",
        json={"nombre": "Sector A", "descripcion": "Electrónica"},
        headers=auth_headers,
    )
    assert sector_response.status_code == 201
    sector = sector_response.json()
    sector_id = sector["id"]
    assert sector["deposito_id"] == deposito_id

    ubicacion_response = client.post(
        f"/api/v1/depositos/{deposito_id}/sectores/{sector_id}/ubicaciones",
        json={"codigo": "A-01", "descripcion": "Estante 1"},
        headers=auth_headers,
    )
    assert ubicacion_response.status_code == 201
    ubicacion = ubicacion_response.json()
    assert ubicacion["sector_id"] == sector_id
    assert ubicacion["codigo"] == "A-01"

    sectores_list = client.get(
        f"/api/v1/depositos/{deposito_id}/sectores", headers=auth_headers
    )
    assert sectores_list.status_code == 200
    assert len(sectores_list.json()) >= 1
    assert sectores_list.json()[0]["nombre"] == "Sector A"

    ubicaciones_list = client.get(
        f"/api/v1/depositos/{deposito_id}/sectores/{sector_id}/ubicaciones",
        headers=auth_headers,
    )
    assert ubicaciones_list.status_code == 200
    codigos = [u["codigo"] for u in ubicaciones_list.json()]
    assert "A-01" in codigos

    detalle = client.get(
        f"/api/v1/depositos/{deposito_id}?include_tree=true",
        headers=auth_headers,
    )
    assert detalle.status_code == 200
    tree = detalle.json()
    assert tree["nombre"] == nombre_deposito
    assert len(tree["sectores"]) == 1
    assert tree["sectores"][0]["ubicaciones"][0]["codigo"] == "A-01"


def test_sector_no_pertenece_a_deposito(client: TestClient, auth_headers):
    dep1 = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep A")},
        headers=auth_headers,
    ).json()
    dep2 = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep B")},
        headers=auth_headers,
    ).json()
    sector = client.post(
        f"/api/v1/depositos/{dep1['id']}/sectores",
        json={"nombre": "Sector X"},
        headers=auth_headers,
    ).json()

    response = client.get(
        f"/api/v1/depositos/{dep2['id']}/sectores/{sector['id']}",
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_delete_deposito_hard_y_bloquea_con_stock(client: TestClient, auth_headers):
    nombre = _unique("Dep Temporal")
    deposito = client.post(
        "/api/v1/depositos",
        json={"nombre": nombre},
        headers=auth_headers,
    ).json()
    deposito_id = deposito["id"]
    sector = client.post(
        f"/api/v1/depositos/{deposito_id}/sectores",
        json={"nombre": "Sector A"},
        headers=auth_headers,
    ).json()
    ubic = client.post(
        f"/api/v1/depositos/{deposito_id}/sectores/{sector['id']}/ubicaciones",
        json={"codigo": "A-01"},
        headers=auth_headers,
    ).json()

    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Cat")},
        headers=auth_headers,
    ).json()
    activo = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT"),
            "descripcion": "Item",
            "categoria_id": cat["id"],
        },
        headers=auth_headers,
    ).json()
    client.post(
        f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
        json={"ubicacion_id": ubic["id"]},
        headers=auth_headers,
    )

    blocked_ubic = client.delete(
        f"/api/v1/depositos/{deposito_id}/sectores/{sector['id']}/ubicaciones/{ubic['id']}",
        headers=auth_headers,
    )
    assert blocked_ubic.status_code == 409

    blocked_dep = client.delete(f"/api/v1/depositos/{deposito_id}", headers=auth_headers)
    assert blocked_dep.status_code == 409

    client.delete(f"/api/v1/activos/{activo['id']}/ubicacion", headers=auth_headers)
    client.delete(f"/api/v1/activos/{activo['id']}", headers=auth_headers)

    ok_ubic = client.delete(
        f"/api/v1/depositos/{deposito_id}/sectores/{sector['id']}/ubicaciones/{ubic['id']}",
        headers=auth_headers,
    )
    assert ok_ubic.status_code == 204

    # Recrear ubicación y borrar sector (sin stock)
    ubic2 = client.post(
        f"/api/v1/depositos/{deposito_id}/sectores/{sector['id']}/ubicaciones",
        json={"codigo": "A-02"},
        headers=auth_headers,
    ).json()
    assert (
        client.delete(
            f"/api/v1/depositos/{deposito_id}/sectores/{sector['id']}/ubicaciones/{ubic2['id']}",
            headers=auth_headers,
        ).status_code
        == 204
    )
    assert (
        client.delete(
            f"/api/v1/depositos/{deposito_id}/sectores/{sector['id']}",
            headers=auth_headers,
        ).status_code
        == 204
    )

    delete_response = client.delete(f"/api/v1/depositos/{deposito_id}", headers=auth_headers)
    assert delete_response.status_code == 204
    assert client.get(f"/api/v1/depositos/{deposito_id}", headers=auth_headers).status_code == 404

    recreate = client.post("/api/v1/depositos", json={"nombre": nombre}, headers=auth_headers)
    assert recreate.status_code == 201


def test_recrear_deposito_tras_eliminar(client: TestClient, auth_headers):
    nombre = _unique("Dep Recycle")
    created = client.post(
        "/api/v1/depositos",
        json={"nombre": nombre},
        headers=auth_headers,
    )
    assert created.status_code == 201
    deposito_id = created.json()["id"]

    deleted = client.delete(f"/api/v1/depositos/{deposito_id}", headers=auth_headers)
    assert deleted.status_code == 204

    recreate = client.post(
        "/api/v1/depositos",
        json={"nombre": nombre, "descripcion": "Nuevo"},
        headers=auth_headers,
    )
    assert recreate.status_code == 201
    assert recreate.json()["nombre"] == nombre
    assert recreate.json()["id"] != deposito_id


def test_update_deposito_sector_ubicacion(client: TestClient, auth_headers):
    deposito = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep Edit")},
        headers=auth_headers,
    ).json()
    sector = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores",
        json={"nombre": "Original"},
        headers=auth_headers,
    ).json()
    ubic = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores/{sector['id']}/ubicaciones",
        json={"codigo": "X-01"},
        headers=auth_headers,
    ).json()

    upd_dep = client.put(
        f"/api/v1/depositos/{deposito['id']}",
        json={"nombre": deposito["nombre"], "descripcion": "Actualizado"},
        headers=auth_headers,
    )
    assert upd_dep.status_code == 200
    assert upd_dep.json()["descripcion"] == "Actualizado"

    upd_sec = client.put(
        f"/api/v1/depositos/{deposito['id']}/sectores/{sector['id']}",
        json={"nombre": "Renombrado"},
        headers=auth_headers,
    )
    assert upd_sec.status_code == 200
    assert upd_sec.json()["nombre"] == "Renombrado"

    upd_ubic = client.put(
        f"/api/v1/depositos/{deposito['id']}/sectores/{sector['id']}/ubicaciones/{ubic['id']}",
        json={"codigo": "Y-02", "descripcion": "Pasillo"},
        headers=auth_headers,
    )
    assert upd_ubic.status_code == 200
    assert upd_ubic.json()["codigo"] == "Y-02"


def test_duplicate_sector_name_in_deposito(client: TestClient, auth_headers):
    deposito = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep Dup")},
        headers=auth_headers,
    ).json()

    client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores",
        json={"nombre": "Sector Duplicado"},
        headers=auth_headers,
    )
    dup_response = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores",
        json={"nombre": "Sector Duplicado"},
        headers=auth_headers,
    )
    assert dup_response.status_code == 409


def test_duplicate_ubicacion_codigo_in_sector(client: TestClient, auth_headers):
    deposito = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep Ubic")},
        headers=auth_headers,
    ).json()
    sector = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores",
        json={"nombre": "Sector Y"},
        headers=auth_headers,
    ).json()

    base_url = f"/api/v1/depositos/{deposito['id']}/sectores/{sector['id']}/ubicaciones"
    client.post(base_url, json={"codigo": "B-01"}, headers=auth_headers)
    dup_response = client.post(base_url, json={"codigo": "B-01"}, headers=auth_headers)
    assert dup_response.status_code == 409
