from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD


def _admin_headers(client):
    login = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_list_roles_admin(client, admin_user):
    headers = _admin_headers(client)
    response = client.get("/api/v1/roles", headers=headers)
    assert response.status_code == 200
    nombres = {r["nombre"] for r in response.json()}
    assert {"admin", "operador_deposito", "operador_alta", "supervisor"} <= nombres


def test_create_and_deactivate_user(client, admin_user):
    headers = _admin_headers(client)
    created = client.post(
        "/api/v1/usuarios",
        headers=headers,
        json={
            "email": "operador.ui@donnicolas.com",
            "nombre": "Operador UI",
            "password": "secreto123",
            "rol": "operador_alta",
        },
    )
    assert created.status_code == 201, created.text
    user = created.json()
    assert user["rol"] == "operador_alta"
    assert user["activo"] is True

    listed = client.get("/api/v1/usuarios", headers=headers)
    assert listed.status_code == 200
    assert any(u["email"] == "operador.ui@donnicolas.com" for u in listed.json())

    updated = client.patch(
        f"/api/v1/usuarios/{user['id']}",
        headers=headers,
        json={"activo": False},
    )
    assert updated.status_code == 200
    assert updated.json()["activo"] is False

    # cleanup
    client.patch(
        f"/api/v1/usuarios/{user['id']}",
        headers=headers,
        json={"activo": False, "nombre": "Operador UI baja"},
    )


def test_non_admin_forbidden(client, admin_user):
    headers = _admin_headers(client)
    created = client.post(
        "/api/v1/usuarios",
        headers=headers,
        json={
            "email": "deposito.ui@donnicolas.com",
            "nombre": "Depósito UI",
            "password": "secreto123",
            "rol": "operador_deposito",
        },
    )
    assert created.status_code == 201
    email = "deposito.ui@donnicolas.com"

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "secreto123"},
    )
    assert login.status_code == 200
    dep_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    forbidden = client.get("/api/v1/usuarios", headers=dep_headers)
    assert forbidden.status_code == 403
