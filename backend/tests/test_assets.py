import uuid

from fastapi.testclient import TestClient


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def test_categorias_requires_auth(client: TestClient):
    response = client.get("/api/v1/categorias")
    assert response.status_code == 401


def test_create_and_list_categoria(client: TestClient, auth_headers):
    nombre = _unique("Equipos IT")
    create_response = client.post(
        "/api/v1/categorias",
        json={"nombre": nombre, "descripcion": "Equipos de tecnología"},
        headers=auth_headers,
    )
    assert create_response.status_code == 201
    categoria = create_response.json()
    assert categoria["nombre"] == nombre
    assert categoria["activa"] is True

    list_response = client.get("/api/v1/categorias", headers=auth_headers)
    assert list_response.status_code == 200
    nombres = [c["nombre"] for c in list_response.json()]
    assert nombre in nombres

    get_response = client.get(f"/api/v1/categorias/{categoria['id']}", headers=auth_headers)
    assert get_response.status_code == 200
    assert get_response.json()["nombre"] == nombre


def test_update_categoria(client: TestClient, auth_headers):
    create_response = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Herramientas")},
        headers=auth_headers,
    )
    categoria_id = create_response.json()["id"]

    update_response = client.put(
        f"/api/v1/categorias/{categoria_id}",
        json={"descripcion": "Herramientas de taller"},
        headers=auth_headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["descripcion"] == "Herramientas de taller"


def test_delete_categoria_soft(client: TestClient, auth_headers):
    create_response = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Temporal")},
        headers=auth_headers,
    )
    categoria_id = create_response.json()["id"]

    delete_response = client.delete(f"/api/v1/categorias/{categoria_id}", headers=auth_headers)
    assert delete_response.status_code == 204

    list_response = client.get("/api/v1/categorias", headers=auth_headers)
    nombres = [c["nombre"] for c in list_response.json()]
    assert create_response.json()["nombre"] not in nombres


def test_create_and_get_activo(client: TestClient, auth_headers):
    categoria_response = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Mobiliario")},
        headers=auth_headers,
    )
    categoria_id = categoria_response.json()["id"]

    create_response = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT"),
            "descripcion": "Escritorio ejecutivo",
            "categoria_id": categoria_id,
            "datos_tecnicos": {"material": "madera"},
        },
        headers=auth_headers,
    )
    assert create_response.status_code == 201
    activo = create_response.json()
    assert activo["descripcion"] == "Escritorio ejecutivo"
    assert activo["datos_tecnicos"]["material"] == "madera"

    get_response = client.get(f"/api/v1/activos/{activo['id']}", headers=auth_headers)
    assert get_response.status_code == 200


def test_update_activo(client: TestClient, auth_headers):
    categoria_response = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Vehículos")},
        headers=auth_headers,
    )
    categoria_id = categoria_response.json()["id"]

    create_response = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT"),
            "descripcion": "Camioneta",
            "categoria_id": categoria_id,
        },
        headers=auth_headers,
    )
    activo_id = create_response.json()["id"]

    update_response = client.put(
        f"/api/v1/activos/{activo_id}",
        json={
            "descripcion": "Camioneta Ford Ranger",
            "epc": f"E2801160600002038F4259{_unique('')[:4]}",
        },
        headers=auth_headers,
    )
    assert update_response.status_code == 200
    data = update_response.json()
    assert data["descripcion"] == "Camioneta Ford Ranger"
    assert data["epc"] is not None


def test_delete_activo_soft(client: TestClient, auth_headers):
    categoria_response = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Consumibles")},
        headers=auth_headers,
    )
    categoria_id = categoria_response.json()["id"]
    patrimonial = _unique("PAT")

    create_response = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": patrimonial,
            "descripcion": "Toner impresora",
            "categoria_id": categoria_id,
        },
        headers=auth_headers,
    )
    activo_id = create_response.json()["id"]

    delete_response = client.delete(f"/api/v1/activos/{activo_id}", headers=auth_headers)
    assert delete_response.status_code == 204

    list_response = client.get("/api/v1/activos", headers=auth_headers)
    patrimoniales = [a["numero_patrimonial"] for a in list_response.json()]
    assert patrimonial not in patrimoniales


def test_list_activos_with_search(client: TestClient, auth_headers):
    categoria_response = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Electrónica")},
        headers=auth_headers,
    )
    categoria_id = categoria_response.json()["id"]
    patrimonial = _unique("PAT-SEARCH")

    client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": patrimonial,
            "descripcion": "Monitor LED 24 pulgadas",
            "categoria_id": categoria_id,
        },
        headers=auth_headers,
    )

    response = client.get("/api/v1/activos?search=Monitor", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) >= 1
    assert any("Monitor" in a["descripcion"] for a in response.json())


def test_lookup_activo_by_epc(client: TestClient, auth_headers):
    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("LookupCat")},
        headers=auth_headers,
    ).json()
    epc = f"EPC{uuid.uuid4().hex[:12].upper()}"
    activo = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT-EPC"),
            "descripcion": "Activo buscable por RFID",
            "categoria_id": cat["id"],
            "epc": epc,
        },
        headers=auth_headers,
    ).json()

    deposito = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep Lookup")},
        headers=auth_headers,
    ).json()
    sector = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores",
        json={"nombre": "S1"},
        headers=auth_headers,
    ).json()
    ubic = client.post(
        f"/api/v1/depositos/{deposito['id']}/sectores/{sector['id']}/ubicaciones",
        json={"codigo": "U-01"},
        headers=auth_headers,
    ).json()
    client.post(
        f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
        json={"ubicacion_id": ubic["id"]},
        headers=auth_headers,
    )

    found = client.get(f"/api/v1/activos/by-epc/{epc.lower()}", headers=auth_headers)
    assert found.status_code == 200
    data = found.json()
    assert data["encontrado"] is True
    assert data["activo"]["id"] == activo["id"]
    assert data["ubicacion"]["ubicacion_codigo"] == "U-01"
    assert data["ubicacion"]["deposito_nombre"] == deposito["nombre"]

    missing = client.get("/api/v1/activos/by-epc/EPCNOEXISTE999", headers=auth_headers)
    assert missing.status_code == 200
    assert missing.json()["encontrado"] is False
