import uuid

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
    admin_role = next(r for r in response.json() if r["nombre"] == "admin")
    assert "users.manage" in admin_role["permisos"]
    assert "roles.manage" in admin_role["permisos"]


def test_create_and_deactivate_user(client, admin_user):
    headers = _admin_headers(client)
    email = f"operador.ui.{uuid.uuid4().hex[:8]}@donnicolas.com"
    created = client.post(
        "/api/v1/usuarios",
        headers=headers,
        json={
            "email": email,
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
    assert any(u["email"] == email for u in listed.json())

    updated = client.patch(
        f"/api/v1/usuarios/{user['id']}",
        headers=headers,
        json={"activo": False},
    )
    assert updated.status_code == 200
    assert updated.json()["activo"] is False


def test_non_admin_forbidden(client, admin_user):
    headers = _admin_headers(client)
    email = f"deposito.ui.{uuid.uuid4().hex[:8]}@donnicolas.com"
    created = client.post(
        "/api/v1/usuarios",
        headers=headers,
        json={
            "email": email,
            "nombre": "Depósito UI",
            "password": "secreto123",
            "rol": "operador_deposito",
        },
    )
    assert created.status_code == 201, created.text

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "secreto123"},
    )
    assert login.status_code == 200
    dep_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    forbidden = client.get("/api/v1/usuarios", headers=dep_headers)
    assert forbidden.status_code == 403


def test_create_role_with_permissions(client, admin_user):
    headers = _admin_headers(client)
    name = f"auditor_{uuid.uuid4().hex[:6]}"
    created = client.post(
        "/api/v1/roles",
        headers=headers,
        json={
            "nombre": name,
            "descripcion": "Solo cancela transferencias",
            "permisos": ["transfer.cancel"],
        },
    )
    assert created.status_code == 201, created.text
    role = created.json()
    assert role["nombre"] == name
    assert role["permisos"] == ["transfer.cancel"]
    assert role["es_sistema"] is False

    updated = client.patch(
        f"/api/v1/roles/{role['id']}",
        headers=headers,
        json={"permisos": ["transfer.cancel", "assets.write"]},
    )
    assert updated.status_code == 200
    assert set(updated.json()["permisos"]) == {"transfer.cancel", "assets.write"}

    deleted = client.delete(f"/api/v1/roles/{role['id']}", headers=headers)
    assert deleted.status_code == 204
