import uuid

from fastapi.testclient import TestClient


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _seed_activo(client: TestClient, auth_headers: dict, *, with_ubicacion: bool = True) -> dict:
    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("CatDash")},
        headers=auth_headers,
    ).json()
    activo = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT-D"),
            "descripcion": "Activo dashboard",
            "categoria_id": cat["id"],
            "epc": f"E280DASH{_unique('')[:6]}".upper(),
        },
        headers=auth_headers,
    ).json()

    if with_ubicacion:
        dep = client.post(
            "/api/v1/depositos",
            json={"nombre": _unique("DepDash")},
            headers=auth_headers,
        ).json()
        sec = client.post(
            f"/api/v1/depositos/{dep['id']}/sectores",
            json={"nombre": "Sector Dash"},
            headers=auth_headers,
        ).json()
        ubi = client.post(
            f"/api/v1/depositos/{dep['id']}/sectores/{sec['id']}/ubicaciones",
            json={"codigo": "D-01"},
            headers=auth_headers,
        ).json()
        client.post(
            f"/api/v1/activos/{activo['id']}/asignar-ubicacion",
            json={"ubicacion_id": ubi["id"]},
            headers=auth_headers,
        )
        return {"activo": activo, "deposito": dep}

    return {"activo": activo, "deposito": None}


def test_movimientos_filtra_por_accion_y_pagina(client: TestClient, auth_headers):
    seed = _seed_activo(client, auth_headers)
    activo_id = seed["activo"]["id"]

    client.put(
        f"/api/v1/activos/{activo_id}",
        json={"descripcion": "Activo dashboard actualizado"},
        headers=auth_headers,
    )

    page = client.get(
        "/api/v1/movimientos",
        params={"accion": "actualizacion", "limit": 10, "search": "PAT-D"},
        headers=auth_headers,
    )
    assert page.status_code == 200, page.text
    data = page.json()
    assert data["total"] >= 1
    assert all(item["accion"] == "actualizacion" for item in data["items"])
    assert any(item["activo_id"] == activo_id for item in data["items"])

    by_activo = client.get(
        "/api/v1/movimientos",
        params={"activo_id": activo_id},
        headers=auth_headers,
    )
    assert by_activo.status_code == 200
    acciones = {item["accion"] for item in by_activo.json()["items"]}
    assert "creacion" in acciones
    assert "asignacion_ubicacion" in acciones


def test_dashboard_resumen_kpis(client: TestClient, auth_headers):
    seed = _seed_activo(client, auth_headers)

    resumen = client.get("/api/v1/dashboard/resumen", headers=auth_headers)
    assert resumen.status_code == 200, resumen.text
    body = resumen.json()

    assert body["kpis"]["activos_activos"] >= 1
    assert body["kpis"]["depositos_activos"] >= 1
    assert body["kpis"]["stock_total_ubicado"] >= 1
    assert isinstance(body["stock_por_deposito"], list)
    assert any(s["deposito_id"] == seed["deposito"]["id"] for s in body["stock_por_deposito"])
    assert isinstance(body["movimientos_recientes"], list)
    assert any(m["activo_id"] == seed["activo"]["id"] for m in body["movimientos_recientes"])
    assert "transferencias_recientes" in body
    assert "inventarios_recientes" in body
