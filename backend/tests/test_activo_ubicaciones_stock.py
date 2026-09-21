"""Ubicaciones con stock de un artículo (inventario por SKU)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _crear_activo_en_ubicacion(client: TestClient, headers: dict, suffix: str) -> dict:
    cat = client.post(
        "/api/v1/categorias",
        json={"nombre": f"Cat-Ubi-{suffix}-{__import__('uuid').uuid4().hex[:6]}"},
        headers=headers,
    ).json()
    dep = client.post(
        "/api/v1/depositos",
        json={"nombre": f"Dep-Ubi-{suffix}-{__import__('uuid').uuid4().hex[:6]}"},
        headers=headers,
    ).json()
    sec = client.post(
        f"/api/v1/depositos/{dep['id']}/sectores",
        json={"nombre": f"Sec-{suffix}"},
        headers=headers,
    ).json()
    ubi = client.post(
        f"/api/v1/depositos/{dep['id']}/sectores/{sec['id']}/ubicaciones",
        json={"codigo": f"U-{suffix}"},
        headers=headers,
    ).json()
    activo = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": f"SKU-UBI-{suffix}-{__import__('uuid').uuid4().hex[:6]}",
            "descripcion": "Prueba ubicaciones stock",
            "categoria_id": cat["id"],
            "ubicacion_id": ubi["id"],
        },
        headers=headers,
    ).json()
    client.post(
        f"/api/v1/activos/{activo['id']}/etiquetas",
        json={"cantidad": 2, "modo": "nueva"},
        headers=headers,
    )
    return {
        "activo": activo,
        "deposito": dep,
        "sector": sec,
        "ubicacion": ubi,
    }


def test_list_ubicaciones_stock_activo(client: TestClient, auth_headers):
    setup = _crear_activo_en_ubicacion(client, auth_headers, "A1")
    resp = client.get(
        f"/api/v1/activos/{setup['activo']['id']}/ubicaciones-stock",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["ubicacion_id"] == setup["ubicacion"]["id"]
    assert rows[0]["deposito_id"] == setup["deposito"]["id"]
    assert rows[0]["cantidad"] == 2


def test_inventario_articulo_ubicacion_y_auditoria(
    client: TestClient, mobile_auth_headers, auth_headers
):
    setup = _crear_activo_en_ubicacion(client, auth_headers, "B2")
    # Etiquetas creadas: listar EPCs del stock
    stock = client.get(
        f"/api/v1/depositos/{setup['deposito']['id']}/stock",
        headers=auth_headers,
    ).json()
    epcs = [
        u["epc"]
        for u in stock["activos"]
        if u["activo_id"] == setup["activo"]["id"] and u.get("epc")
    ]
    assert len(epcs) == 2

    inv = client.post(
        "/api/v1/inventarios",
        json={
            "deposito_id": setup["deposito"]["id"],
            "ubicacion_id": setup["ubicacion"]["id"],
            "sector_id": setup["sector"]["id"],
            "activo_id": setup["activo"]["id"],
        },
        headers=mobile_auth_headers,
    )
    assert inv.status_code == 201, inv.text
    data = inv.json()
    assert data["total_esperado"] == 2
    assert len(data["detalles"]) == 2

    # Leer solo una unidad → faltante
    closed = client.post(
        f"/api/v1/inventarios/{data['id']}/cerrar",
        json={"epcs": [epcs[0]]},
        headers=mobile_auth_headers,
    )
    assert closed.status_code == 200
    body = closed.json()
    assert body["resumen"]["total_encontrado"] == 1
    assert body["resumen"]["total_faltante"] == 1

    audited = client.post(
        f"/api/v1/inventarios/{data['id']}/auditar",
        json={"auditado": True, "comentario": "OK APK"},
        headers=auth_headers,
    )
    assert audited.status_code == 200
    assert audited.json()["ajuste_aplicado"] is True

    slots = client.get(
        f"/api/v1/activos/{setup['activo']['id']}/ubicaciones-stock",
        headers=auth_headers,
    ).json()
    assert len(slots) == 1
    assert slots[0]["cantidad"] == 1
