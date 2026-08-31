import uuid

from fastapi.testclient import TestClient


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _crear_jerarquia(client: TestClient, auth_headers: dict) -> dict:
    deposito = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep Stock")},
        headers=auth_headers,
    ).json()
    sector = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores",
        json={"nombre": "Sector Stock"},
        headers=auth_headers,
    ).json()
    ubicacion = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores/{sector['id']}/ubicaciones",
        json={"codigo": f"ST-{_unique('')[:4]}"},
        headers=auth_headers,
    ).json()
    return {"deposito": deposito, "sector": sector, "ubicacion": ubicacion}


def _crear_activo(client: TestClient, auth_headers: dict) -> dict:
    categoria = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Cat Stock")},
        headers=auth_headers,
    ).json()
    return client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT"),
            "descripcion": "Activo de prueba stock",
            "categoria_id": categoria["id"],
        },
        headers=auth_headers,
    ).json()


def test_asignar_y_consultar_ubicacion_activo(client: TestClient, auth_headers):
    jerarquia = _crear_jerarquia(client, auth_headers)
    activo = _crear_activo(client, auth_headers)
    ubicacion_id = jerarquia["ubicacion"]["id"]

    asignar = client.post(
        f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
        json={"ubicacion_id": ubicacion_id},
        headers=auth_headers,
    )
    assert asignar.status_code == 200
    data = asignar.json()
    assert data["activo_id"] == activo["id"]
    assert data["ubicacion_id"] == ubicacion_id
    assert data["ubicacion_codigo"] == jerarquia["ubicacion"]["codigo"]
    assert data["deposito_nombre"] == jerarquia["deposito"]["nombre"]

    consulta = client.get(
        f"/api/v1/activos/{activo['id']}/ubicacion",
        headers=auth_headers,
    )
    assert consulta.status_code == 200
    assert consulta.json()["ubicacion_id"] == ubicacion_id


def test_consultar_stock_ubicacion(client: TestClient, auth_headers):
    jerarquia = _crear_jerarquia(client, auth_headers)
    activo1 = _crear_activo(client, auth_headers)
    activo2 = _crear_activo(client, auth_headers)
    ubicacion_id = jerarquia["ubicacion"]["id"]

    for activo in (activo1, activo2):
        client.post(
            f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
            json={"ubicacion_id": ubicacion_id},
            headers=auth_headers,
        )

    stock = client.get(f"/api/v1/ubicaciones/{ubicacion_id}/stock", headers=auth_headers)
    assert stock.status_code == 200
    data = stock.json()
    assert data["total"] == 2
    assert len(data["activos"]) == 2
    patrimoniales = {a["numero_patrimonial"] for a in data["activos"]}
    assert activo1["numero_patrimonial"] in patrimoniales
    assert activo2["numero_patrimonial"] in patrimoniales


def test_reasignar_activo_a_otra_ubicacion(client: TestClient, auth_headers):
    jerarquia = _crear_jerarquia(client, auth_headers)
    deposito_id = jerarquia["deposito"]["id"]
    sector_id = jerarquia["sector"]["id"]

    ubicacion2 = client.post(
        f"/api/v1/depositos/{deposito_id}/sectores/{sector_id}/ubicaciones",
        json={"codigo": f"ST2-{_unique('')[:4]}"},
        headers=auth_headers,
    ).json()

    activo = _crear_activo(client, auth_headers)
    client.post(
        f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
        json={"ubicacion_id": jerarquia["ubicacion"]["id"]},
        headers=auth_headers,
    )

    reasignar = client.post(
        f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
        json={"ubicacion_id": ubicacion2["id"]},
        headers=auth_headers,
    )
    assert reasignar.status_code == 200
    assert reasignar.json()["ubicacion_id"] == ubicacion2["id"]

    stock_vieja = client.get(
        f"/api/v1/ubicaciones/{jerarquia['ubicacion']['id']}/stock",
        headers=auth_headers,
    )
    assert stock_vieja.json()["total"] == 0

    stock_nueva = client.get(
        f"/api/v1/ubicaciones/{ubicacion2['id']}/stock",
        headers=auth_headers,
    )
    assert stock_nueva.json()["total"] == 1


def test_desasignar_ubicacion(client: TestClient, auth_headers):
    jerarquia = _crear_jerarquia(client, auth_headers)
    activo = _crear_activo(client, auth_headers)

    client.post(
        f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
        json={"ubicacion_id": jerarquia["ubicacion"]["id"]},
        headers=auth_headers,
    )

    desasignar = client.delete(
        f"/api/v1/activos/{activo['id']}/ubicacion",
        headers=auth_headers,
    )
    assert desasignar.status_code == 204

    consulta = client.get(
        f"/api/v1/activos/{activo['id']}/ubicacion",
        headers=auth_headers,
    )
    assert consulta.status_code == 404


def test_asignar_ubicacion_invalida(client: TestClient, auth_headers):
    activo = _crear_activo(client, auth_headers)
    fake_id = str(uuid.uuid4())

    response = client.post(
        f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
        json={"ubicacion_id": fake_id},
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_asignacion_registra_historial(client: TestClient, auth_headers):
    jerarquia = _crear_jerarquia(client, auth_headers)
    activo = _crear_activo(client, auth_headers)

    client.post(
        f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
        json={"ubicacion_id": jerarquia["ubicacion"]["id"]},
        headers=auth_headers,
    )

    historial = client.get(
        f"/api/v1/activos/{activo['id']}/historial",
        headers=auth_headers,
    )
    assert historial.status_code == 200
    acciones = [h["accion"] for h in historial.json()]
    assert "asignacion_ubicacion" in acciones
