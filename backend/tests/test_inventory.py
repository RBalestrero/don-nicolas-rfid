import uuid

from fastapi.testclient import TestClient

# EPCs esquema D1 (Don Nicolás) — válidos para lecturas / sobrantes
EPC_A = "D100000000010000000001A1"
EPC_B = "D100000000020000000001A1"
EPC_C = "D100000000030000000001A1"
EPC_SOBRANTE_DESCONOCIDO = "D100000F423F0000000001A1"
EPC_SOBRANTE_CONOCIDO = "D100000000990000000001A1"


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

    a1 = crear_con_epc("Activo A", EPC_A)
    a2 = crear_con_epc("Activo B", EPC_B)
    a3 = crear_con_epc("Activo C", EPC_C)

    return {
        "deposito": deposito,
        "sector": sector,
        "ubic": ubic,
        "cat": cat,
        "activos": [a1, a2, a3],
        "epcs": [EPC_A, EPC_B, EPC_C],
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
        json={"epcs": [EPC_A, EPC_B, EPC_SOBRANTE_DESCONOCIDO]},
        headers=mobile_auth_headers,
    )
    assert lecturas.status_code == 200
    mid = lecturas.json()
    assert mid["resumen"]["total_encontrado"] == 2
    assert mid["resumen"]["total_faltante"] == 1
    assert mid["resumen"]["total_sobrante"] == 0

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
    assert result["resumen"]["total_sobrante"] == 0

    estados = {d["epc"]: d["estado"] for d in result["detalles"]}
    assert estados[EPC_A] == "encontrado"
    assert estados[EPC_B] == "encontrado"
    assert estados[EPC_C] == "faltante"
    assert EPC_SOBRANTE_DESCONOCIDO not in estados


def test_cerrar_con_discrepancias_no_ajusta_stock_hasta_auditar(
    client: TestClient, mobile_auth_headers, auth_headers
):
    """Al cerrar se clasifican faltantes; el stock se ajusta solo al confirmar auditoría."""
    setup = _setup_inventario_base(client, mobile_auth_headers)
    faltante = setup["activos"][2]  # EPC_C

    # Sobrante conocido: activo en otro depósito
    otro_dep = client.post(
        "/api/v1/depositos",
        json={"nombre": _unique("Dep Otro")},
        headers=mobile_auth_headers,
    ).json()
    otro_sec = client.post(
        f"/api/v1/depositos/{otro_dep['id']}/sectores",
        json={"nombre": "Sector Otro"},
        headers=mobile_auth_headers,
    ).json()
    otra_ubic = client.post(
        f"/api/v1/depositos/{otro_dep['id']}/sectores/{otro_sec['id']}/ubicaciones",
        json={"codigo": "OTRO-01"},
        headers=mobile_auth_headers,
    ).json()
    sobrante = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT"),
            "descripcion": "Sobrante conocido",
            "categoria_id": setup["cat"]["id"],
            "epc": EPC_SOBRANTE_CONOCIDO,
        },
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/activos/{sobrante['id']}/asignar-ubicacion",
        json={"ubicacion_id": otra_ubic["id"]},
        headers=mobile_auth_headers,
    )

    inv = client.post(
        "/api/v1/inventarios",
        json={
            "deposito_id": setup["deposito"]["id"],
            "ubicacion_id": setup["ubic"]["id"],
        },
        headers=mobile_auth_headers,
    ).json()

    cerrado = client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": [EPC_A, EPC_B, EPC_SOBRANTE_CONOCIDO]},
        headers=mobile_auth_headers,
    )
    assert cerrado.status_code == 200
    result = cerrado.json()
    assert result["resumen"]["total_faltante"] == 1
    assert result["resumen"]["total_sobrante"] == 0
    assert result["resumen"]["total_encontrado"] == 2
    assert result["resumen"]["total_esperado"] == 3
    assert result["ajuste_aplicado"] is False
    assert result["auditado"] is False

    # Tras cerrar: el faltante sigue en stock (ajuste diferido a auditoría)
    stock = client.get(
        f"/api/v1/depositos/{setup['deposito']['id']}/stock",
        headers=mobile_auth_headers,
    )
    assert stock.status_code == 200
    stock_epcs = {item["epc"] for item in stock.json()["activos"]}
    assert EPC_C in stock_epcs
    assert EPC_A in stock_epcs
    assert EPC_B in stock_epcs
    assert EPC_SOBRANTE_CONOCIDO not in stock_epcs

    hist_pre = client.get(
        f"/api/v1/activos/{faltante['id']}/historial",
        headers=mobile_auth_headers,
    ).json()
    assert not any(h["accion"] == "ajuste_inventario" for h in hist_pre)

    audited = client.post(
        f"/api/v1/inventarios/{inv['id']}/auditar",
        json={"auditado": True, "comentario": "Confirmado"},
        headers=auth_headers,
    )
    assert audited.status_code == 200
    audited_data = audited.json()
    assert audited_data["auditado"] is True
    assert audited_data["ajuste_aplicado"] is True

    stock_post = client.get(
        f"/api/v1/depositos/{setup['deposito']['id']}/stock",
        headers=mobile_auth_headers,
    )
    assert stock_post.status_code == 200
    stock_epcs_post = {item["epc"] for item in stock_post.json()["activos"]}
    assert EPC_C not in stock_epcs_post
    assert EPC_A in stock_epcs_post
    assert EPC_B in stock_epcs_post
    assert EPC_SOBRANTE_CONOCIDO not in stock_epcs_post

    # EPC ajeno al depósito no se reporta como sobrante ni se toca
    ubic_sobrante = client.get(
        f"/api/v1/activos/{sobrante['id']}/ubicacion",
        headers=mobile_auth_headers,
    )
    assert ubic_sobrante.status_code == 200
    assert ubic_sobrante.json()["ubicacion_id"] == otra_ubic["id"]

    ubic_faltante = client.get(
        f"/api/v1/activos/{faltante['id']}/ubicacion",
        headers=mobile_auth_headers,
    )
    assert ubic_faltante.status_code == 404

    hist_faltante = client.get(
        f"/api/v1/activos/{faltante['id']}/historial",
        headers=mobile_auth_headers,
    )
    assert hist_faltante.status_code == 200
    ajustes_f = [h for h in hist_faltante.json() if h["accion"] == "ajuste_inventario"]
    assert len(ajustes_f) == 1
    assert ajustes_f[0]["cambios"]["tipo"] == "faltante"
    assert ajustes_f[0]["cambios"]["inventario_id"] == inv["id"]
    assert ajustes_f[0]["cambios"]["epc"] == EPC_C

    # Segunda auditoría: no duplica historial
    again = client.post(
        f"/api/v1/inventarios/{inv['id']}/auditar",
        json={"auditado": True, "comentario": "Actualizado"},
        headers=auth_headers,
    )
    assert again.status_code == 200
    hist_again = client.get(
        f"/api/v1/activos/{faltante['id']}/historial",
        headers=mobile_auth_headers,
    ).json()
    assert len([h for h in hist_again if h["accion"] == "ajuste_inventario"]) == 1

    hist_sobrante = client.get(
        f"/api/v1/activos/{sobrante['id']}/historial",
        headers=mobile_auth_headers,
    )
    assert hist_sobrante.status_code == 200
    ajustes_s = [h for h in hist_sobrante.json() if h["accion"] == "ajuste_inventario"]
    assert len(ajustes_s) == 0


def test_descartar_inventario_cerrado_no_ajusta_stock(
    client: TestClient, mobile_auth_headers, auth_headers
):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    faltante = setup["activos"][2]
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": [EPC_A, EPC_B]},
        headers=mobile_auth_headers,
    )

    discarded = client.post(
        f"/api/v1/inventarios/{inv['id']}/descartar",
        json={"comentario": "Conteo inválido / antena mal calibrada"},
        headers=auth_headers,
    )
    assert discarded.status_code == 200
    data = discarded.json()
    assert data["estado"] == "descartado"
    assert data["auditado"] is True
    assert data["ajuste_aplicado"] is False
    assert data["comentario_auditoria"] == "Conteo inválido / antena mal calibrada"
    assert data["resumen"]["total_faltante"] == 1

    stock = client.get(
        f"/api/v1/depositos/{setup['deposito']['id']}/stock",
        headers=mobile_auth_headers,
    ).json()
    stock_epcs = {item["epc"] for item in stock["activos"]}
    assert EPC_C in stock_epcs

    hist = client.get(
        f"/api/v1/activos/{faltante['id']}/historial",
        headers=mobile_auth_headers,
    ).json()
    assert not any(h["accion"] == "ajuste_inventario" for h in hist)

    again = client.post(
        f"/api/v1/inventarios/{inv['id']}/descartar",
        json={"comentario": "otra vez"},
        headers=auth_headers,
    )
    assert again.status_code == 409


def test_descartar_requiere_comentario(client: TestClient, mobile_auth_headers, auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": setup["epcs"]},
        headers=mobile_auth_headers,
    )
    res = client.post(
        f"/api/v1/inventarios/{inv['id']}/descartar",
        json={"comentario": "   "},
        headers=auth_headers,
    )
    assert res.status_code == 422


def test_descartar_bloqueado_tras_auditar(client: TestClient, mobile_auth_headers, auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": [EPC_A]},
        headers=mobile_auth_headers,
    )
    client.post(
        f"/api/v1/inventarios/{inv['id']}/auditar",
        json={"auditado": True, "comentario": "OK"},
        headers=auth_headers,
    )
    res = client.post(
        f"/api/v1/inventarios/{inv['id']}/descartar",
        json={"comentario": "tarde"},
        headers=auth_headers,
    )
    assert res.status_code == 409


def test_auditar_no_permite_revertir_si_ajuste_aplicado(
    client: TestClient, mobile_auth_headers, auth_headers
):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": [EPC_A]},
        headers=mobile_auth_headers,
    )
    client.post(
        f"/api/v1/inventarios/{inv['id']}/auditar",
        json={"auditado": True},
        headers=auth_headers,
    )
    res = client.post(
        f"/api/v1/inventarios/{inv['id']}/auditar",
        json={"auditado": False},
        headers=auth_headers,
    )
    assert res.status_code == 409


def test_cerrar_sin_discrepancias_no_ajusta_historial(
    client: TestClient, mobile_auth_headers
):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": setup["epcs"]},
        headers=mobile_auth_headers,
    )

    for activo in setup["activos"]:
        hist = client.get(
            f"/api/v1/activos/{activo['id']}/historial",
            headers=mobile_auth_headers,
        ).json()
        assert not any(h["accion"] == "ajuste_inventario" for h in hist)


def test_inventario_cerrar_con_lecturas_finales(client: TestClient, mobile_auth_headers):
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
        json={"epcs": [EPC_A]},
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
        json={"epcs": [EPC_A, EPC_SOBRANTE_DESCONOCIDO]},
        headers=mobile_auth_headers,
    )

    reporte = client.get(
        f"/api/v1/inventarios/{inv['id']}/reporte",
        headers=mobile_auth_headers,
    )
    assert reporte.status_code == 200
    data = reporte.json()
    assert data["tiene_discrepancias"] is True
    assert len(data["encontrados"]) == 1
    assert len(data["faltantes"]) == 2
    assert len(data["sobrantes"]) == 0
    assert len(data["ajenos"]) == 0
    assert len(data["excesos"]) == 0
    assert data["encontrados"][0]["epc"] == EPC_A
    assert {d["epc"] for d in data["faltantes"]} == {EPC_B, EPC_C}
    assert data["resumen"]["total_exceso"] == 0

    listed = client.get(
        "/api/v1/inventarios",
        params={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    )
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) >= 1
    assert items[0]["total_faltante"] == 2
    assert items[0]["total_sobrante"] == 0
    assert items[0]["total_exceso"] == 0


def test_ajenos_no_son_discrepancia_si_conteo_completo(client: TestClient, mobile_auth_headers):
    """EPCs fuera del depósito se ignoran; no marcan discrepancia si el conteo es completo."""
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": [*setup["epcs"], EPC_SOBRANTE_DESCONOCIDO]},
        headers=mobile_auth_headers,
    )
    data = client.get(
        f"/api/v1/inventarios/{inv['id']}/reporte",
        headers=mobile_auth_headers,
    ).json()
    assert data["tiene_discrepancias"] is False
    assert len(data["faltantes"]) == 0
    assert len(data["ajenos"]) == 0
    assert len(data["excesos"]) == 0
    assert data["resumen"]["total_exceso"] == 0


def test_exceso_mismo_articulo_se_ignora(client: TestClient, mobile_auth_headers):
    """Más etiquetas del mismo artículo fuera del snapshot no se reportan."""
    setup = _setup_inventario_base(client, mobile_auth_headers)
    # Mismo código de artículo que EPC_A (…0001…), otro serial
    epc_exceso = "D100000000010000000099A1"
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": [*setup["epcs"], epc_exceso]},
        headers=mobile_auth_headers,
    )
    data = client.get(
        f"/api/v1/inventarios/{inv['id']}/reporte",
        headers=mobile_auth_headers,
    ).json()
    assert data["tiene_discrepancias"] is False
    assert len(data["faltantes"]) == 0
    assert len(data["excesos"]) == 0
    assert len(data["ajenos"]) == 0
    assert data["resumen"]["total_exceso"] == 0
    assert data["resumen"]["total_sobrante"] == 0


def test_reporte_sin_discrepancias(client: TestClient, mobile_auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": setup["epcs"]},
        headers=mobile_auth_headers,
    )
    reporte = client.get(
        f"/api/v1/inventarios/{inv['id']}/reporte",
        headers=mobile_auth_headers,
    ).json()
    assert reporte["tiene_discrepancias"] is False
    assert len(reporte["faltantes"]) == 0
    assert len(reporte["sobrantes"]) == 0


def test_auditar_inventario_cerrado_desde_web(client: TestClient, mobile_auth_headers, auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={"epcs": [EPC_A]},
        headers=mobile_auth_headers,
    )

    audited = client.post(
        f"/api/v1/inventarios/{inv['id']}/auditar",
        json={"auditado": True, "comentario": "Revisado"},
        headers=auth_headers,
    )
    assert audited.status_code == 200
    data = audited.json()
    assert data["auditado"] is True
    assert data["comentario_auditoria"] == "Revisado"
    assert data["auditado_por_id"] is not None
    assert data["ajuste_aplicado"] is True

    # Con faltantes, confirmar auditoría aplica stock
    stock = client.get(
        f"/api/v1/depositos/{setup['deposito']['id']}/stock",
        headers=mobile_auth_headers,
    ).json()
    stock_epcs = {item["epc"] for item in stock["activos"]}
    assert EPC_A in stock_epcs
    assert EPC_B not in stock_epcs
    assert EPC_C not in stock_epcs


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


def test_resetear_lecturas_vuelve_a_cero(client: TestClient, mobile_auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    lecturas = client.post(
        f"/api/v1/inventarios/{inv['id']}/lecturas",
        json={"epcs": [EPC_A, EPC_SOBRANTE_DESCONOCIDO]},
        headers=mobile_auth_headers,
    )
    assert lecturas.status_code == 200
    mid = lecturas.json()
    assert mid["resumen"]["total_encontrado"] == 1
    assert mid["resumen"]["total_sobrante"] == 0

    reset = client.post(
        f"/api/v1/inventarios/{inv['id']}/lecturas/reset",
        headers=mobile_auth_headers,
    )
    assert reset.status_code == 200
    data = reset.json()
    assert data["estado"] == "en_curso"
    assert data["resumen"]["total_esperado"] == 3
    assert data["resumen"]["total_encontrado"] == 0
    assert data["resumen"]["total_faltante"] == 3
    assert data["resumen"]["total_sobrante"] == 0
    estados = {d["epc"]: d["estado"] for d in data["detalles"]}
    assert estados[EPC_A] == "esperado"
    assert estados[EPC_B] == "esperado"
    assert estados[EPC_C] == "esperado"
    assert EPC_SOBRANTE_DESCONOCIDO not in estados
    assert all(d.get("leido_en") is None for d in data["detalles"])

    relidas = client.post(
        f"/api/v1/inventarios/{inv['id']}/lecturas",
        json={"epcs": [EPC_B]},
        headers=mobile_auth_headers,
    )
    assert relidas.status_code == 200
    assert relidas.json()["resumen"]["total_encontrado"] == 1


def test_resetear_lecturas_solo_en_curso(client: TestClient, mobile_auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/cerrar",
        json={},
        headers=mobile_auth_headers,
    )
    reset = client.post(
        f"/api/v1/inventarios/{inv['id']}/lecturas/reset",
        headers=mobile_auth_headers,
    )
    assert reset.status_code == 409


def test_resetear_lecturas_requiere_mc33(client: TestClient, mobile_auth_headers, auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    reset = client.post(
        f"/api/v1/inventarios/{inv['id']}/lecturas/reset",
        headers=auth_headers,
    )
    assert reset.status_code == 403
    assert reset.json()["detail"]["code"] == "INVENTORY_MOBILE_ONLY"


def test_cancelar_inventario_en_curso(client: TestClient, mobile_auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    inv = client.post(
        "/api/v1/inventarios",
        json={"deposito_id": setup["deposito"]["id"]},
        headers=mobile_auth_headers,
    ).json()
    client.post(
        f"/api/v1/inventarios/{inv['id']}/lecturas",
        json={"epcs": [EPC_A]},
        headers=mobile_auth_headers,
    )
    cancelled = client.post(
        f"/api/v1/inventarios/{inv['id']}/cancelar",
        headers=mobile_auth_headers,
    )
    assert cancelled.status_code == 200
    data = cancelled.json()
    assert data["estado"] == "cancelado"
    assert data["cerrado_en"] is not None

    again = client.post(
        f"/api/v1/inventarios/{inv['id']}/lecturas",
        json={"epcs": [EPC_B]},
        headers=mobile_auth_headers,
    )
    assert again.status_code == 409

    open_list = client.get(
        "/api/v1/inventarios",
        params={"deposito_id": setup["deposito"]["id"], "estado": "en_curso"},
        headers=mobile_auth_headers,
    )
    assert open_list.status_code == 200
    assert all(i["id"] != inv["id"] for i in open_list.json())


def test_inventario_por_activo_id(client: TestClient, mobile_auth_headers):
    setup = _setup_inventario_base(client, mobile_auth_headers)
    activo_a = setup["activos"][0]
    inv = client.post(
        "/api/v1/inventarios",
        json={
            "deposito_id": setup["deposito"]["id"],
            "activo_id": activo_a["id"],
        },
        headers=mobile_auth_headers,
    )
    assert inv.status_code == 201, inv.text
    data = inv.json()
    assert data["total_esperado"] == 1
    assert len(data["detalles"]) == 1
    assert data["detalles"][0]["activo_id"] == activo_a["id"]
    assert data["detalles"][0]["epc"] == setup["epcs"][0]

    empty = client.post(
        "/api/v1/inventarios",
        json={
            "deposito_id": setup["deposito"]["id"],
            "activo_id": str(uuid.uuid4()),
        },
        headers=mobile_auth_headers,
    )
    assert empty.status_code == 400
