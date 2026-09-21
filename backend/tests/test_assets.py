import uuid

from fastapi.testclient import TestClient

from tests.epc_helpers import epc_de_prueba


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


def test_delete_categoria_hard_y_bloquea_si_en_uso(client: TestClient, auth_headers):
    create_response = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Temporal")},
        headers=auth_headers,
    )
    categoria_id = create_response.json()["id"]
    nombre = create_response.json()["nombre"]

    client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT"),
            "descripcion": "Item",
            "categoria_id": categoria_id,
        },
        headers=auth_headers,
    )
    blocked = client.delete(f"/api/v1/categorias/{categoria_id}", headers=auth_headers)
    assert blocked.status_code == 409

    # Sin activos: se puede eliminar y recrear el nombre
    activo_id = client.get("/api/v1/activos", headers=auth_headers).json()
    for a in activo_id:
        if a["categoria_id"] == categoria_id:
            client.delete(f"/api/v1/activos/{a['id']}", headers=auth_headers)

    delete_response = client.delete(f"/api/v1/categorias/{categoria_id}", headers=auth_headers)
    assert delete_response.status_code == 204

    assert client.get(f"/api/v1/categorias/{categoria_id}", headers=auth_headers).status_code == 404

    recreate = client.post(
        "/api/v1/categorias",
        json={"nombre": nombre},
        headers=auth_headers,
    )
    assert recreate.status_code == 201


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


def test_create_activo_con_ubicacion(client: TestClient, auth_headers):
    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("CatUbi")},
        headers=auth_headers,
    ).json()
    dep = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("DepUbi")},
        headers=auth_headers,
    ).json()
    sec = client.post(
        f"/api/v1/depositos/{dep['id']}/sectores",
        json={"nombre": "S1"},
        headers=auth_headers,
    ).json()
    ubi = client.post(
        f"/api/v1/depositos/{dep['id']}/sectores/{sec['id']}/ubicaciones",
        json={"codigo": "U-01"},
        headers=auth_headers,
    ).json()

    created = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT"),
            "descripcion": "Con ubicación",
            "categoria_id": cat["id"],
            "ubicacion_id": ubi["id"],
        },
        headers=auth_headers,
    )
    assert created.status_code == 201
    body = created.json()
    activo_id = body["id"]
    assert body["ubicacion"] is not None
    assert body["ubicacion"]["ubicacion_id"] == ubi["id"]

    listed = client.get("/api/v1/activos", headers=auth_headers).json()
    row = next(a for a in listed if a["id"] == activo_id)
    assert row["ubicacion"]["ubicacion_codigo"] == "U-01"

    ubic = client.get(f"/api/v1/activos/{activo_id}/ubicacion", headers=auth_headers)
    assert ubic.status_code == 200
    assert ubic.json()["ubicacion_id"] == ubi["id"]


def test_list_activos_ubicacion_desde_etiquetas(client: TestClient, auth_headers):
    """El listado muestra depósito/ubicación aunque solo esté en las unidades RFID."""
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.modules.assets.models import Activo, Etiqueta

    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("CatEtiqUbi")},
        headers=auth_headers,
    ).json()
    dep = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("DepEtiqUbi")},
        headers=auth_headers,
    ).json()
    sec = client.post(
        f"/api/v1/depositos/{dep['id']}/sectores",
        json={"nombre": "S1"},
        headers=auth_headers,
    ).json()
    ubi = client.post(
        f"/api/v1/depositos/{dep['id']}/sectores/{sec['id']}/ubicaciones",
        json={"codigo": "E2"},
        headers=auth_headers,
    ).json()
    activo = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("SKU"),
            "descripcion": "Impresora",
            "categoria_id": cat["id"],
        },
        headers=auth_headers,
    ).json()
    lote = client.post(
        f"/api/v1/activos/{activo['id']}/etiquetas",
        json={"cantidad": 2},
        headers=auth_headers,
    )
    assert lote.status_code == 201, lote.text

    db = SessionLocal()
    try:
        row = db.get(Activo, uuid.UUID(activo["id"]))
        assert row is not None
        row.ubicacion_id = None
        for et in db.scalars(
            select(Etiqueta).where(Etiqueta.activo_id == row.id, Etiqueta.estado == "activa")
        ).all():
            et.ubicacion_id = uuid.UUID(ubi["id"])
        db.commit()
    finally:
        db.close()

    listed = client.get("/api/v1/activos", headers=auth_headers).json()
    row = next(a for a in listed if a["id"] == activo["id"])
    assert row["ubicacion"] is not None
    assert row["ubicacion"]["ubicacion_codigo"] == "E2"
    assert row["ubicacion"]["deposito_nombre"] == dep["nombre"]
    assert row["stock_etiquetas"] == 2


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
            "epc": epc_de_prueba(),
        },
        headers=auth_headers,
    )
    assert update_response.status_code == 200
    data = update_response.json()
    assert data["descripcion"] == "Camioneta Ford Ranger"
    assert data["epc"] is not None


def test_delete_activo_hard_permite_recrear(client: TestClient, auth_headers):
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

    get_response = client.get(f"/api/v1/activos/{activo_id}", headers=auth_headers)
    assert get_response.status_code == 404

    list_response = client.get("/api/v1/activos", headers=auth_headers)
    patrimoniales = [a["numero_patrimonial"] for a in list_response.json()]
    assert patrimonial not in patrimoniales

    recreate = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": patrimonial,
            "descripcion": "Toner recreado",
            "categoria_id": categoria_id,
        },
        headers=auth_headers,
    )
    assert recreate.status_code == 201
    assert recreate.json()["descripcion"] == "Toner recreado"


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


def test_list_activos_search_by_etiqueta_epc(client: TestClient, auth_headers):
    """Localizar por EPC pegado debe encontrar el artículo vía etiquetas.epc."""
    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Localizar")},
        headers=auth_headers,
    )
    categoria_id = cat.json()["id"]
    patrimonial = _unique("PAT-61423012")
    create = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": patrimonial,
            "descripcion": "Impresora térmica ZD220",
            "categoria_id": categoria_id,
        },
        headers=auth_headers,
    )
    assert create.status_code == 201
    activo_id = create.json()["id"]

    lote = client.post(
        f"/api/v1/activos/{activo_id}/etiquetas",
        json={"cantidad": 1},
        headers=auth_headers,
    )
    assert lote.status_code == 201
    epc = lote.json()["etiquetas"][0]["epc"]
    assert epc.startswith("D1")

    by_epc = client.get(f"/api/v1/activos?search={epc}", headers=auth_headers)
    assert by_epc.status_code == 200
    ids = [a["id"] for a in by_epc.json()]
    assert activo_id in ids

    by_prefix = client.get(f"/api/v1/activos?search={epc[:12]}", headers=auth_headers)
    assert by_prefix.status_code == 200
    assert activo_id in [a["id"] for a in by_prefix.json()]


def test_activo_rechaza_epc_ajeno_al_esquema(client: TestClient, auth_headers):
    """El MC33 solo lee EPCs D1: aceptar otros haría que el inventario los dé
    por faltantes y el cierre les quite la ubicación al activo."""
    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("CatEpcAjeno")},
        headers=auth_headers,
    ).json()

    for epc_invalido in ("E2801160600002038F425901", "NO-HEX", "D1ABC"):
        response = client.post(
            "/api/v1/activos",
            json={
                "numero_patrimonial": _unique("PAT-AJENO"),
                "descripcion": "Activo con EPC ajeno",
                "categoria_id": cat["id"],
                "epc": epc_invalido,
            },
            headers=auth_headers,
        )
        assert response.status_code == 422, epc_invalido

    ok = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT-OK"),
            "descripcion": "Activo con EPC del sistema",
            "categoria_id": cat["id"],
            "epc": epc_de_prueba(),
        },
        headers=auth_headers,
    )
    assert ok.status_code == 201


def test_lookup_activo_by_epc(client: TestClient, auth_headers):
    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("LookupCat")},
        headers=auth_headers,
    ).json()
    epc = epc_de_prueba()
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


def test_lookup_activos_by_epcs_batch(client: TestClient, auth_headers):
    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("BatchCat")},
        headers=auth_headers,
    ).json()
    epc_a = epc_de_prueba()
    epc_b = epc_de_prueba()
    a = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT-BA"),
            "descripcion": "Batch A",
            "categoria_id": cat["id"],
            "epc": epc_a,
        },
        headers=auth_headers,
    ).json()
    client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT-BB"),
            "descripcion": "Batch B",
            "categoria_id": cat["id"],
            "epc": epc_b,
        },
        headers=auth_headers,
    ).json()

    res = client.post(
        "/api/v1/activos/lookup-epcs",
        json={"epcs": [epc_a, epc_b, "D1DEADBEEF000000000001A1", epc_a]},
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["consultados"] == 3
    assert len(data["encontrados"]) == 2
    assert len(data["no_registrados"]) == 1
    ids = {row["activo"]["id"] for row in data["encontrados"]}
    assert a["id"] in ids
    assert all(row["encontrado"] is True for row in data["encontrados"])
