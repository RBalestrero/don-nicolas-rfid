import io
import uuid

import pytest
from fastapi.testclient import TestClient

PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@pytest.fixture
def activo_id(client: TestClient, auth_headers) -> str:
    categoria_response = client.post(
        "/api/v1/categorias",
        json={"nombre": _unique("Fotos")},
        headers=auth_headers,
    )
    categoria_id = categoria_response.json()["id"]

    activo_response = client.post(
        "/api/v1/activos",
        json={
            "numero_patrimonial": _unique("PAT-FOTO"),
            "descripcion": "Activo con fotos",
            "categoria_id": categoria_id,
        },
        headers=auth_headers,
    )
    return activo_response.json()["id"]


def test_upload_fotografia_success(client: TestClient, auth_headers, activo_id):
    file_data = io.BytesIO(PNG_1x1)
    response = client.post(
        f"/api/v1/activos/{activo_id}/fotografias",
        headers=auth_headers,
        files={"file": ("foto.png", file_data, "image/png")},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["mime_type"] == "image/png"
    assert data["es_principal"] is True
    assert data["tamano_bytes"] > 0
    assert data["url"].endswith("/archivo")


def test_upload_fotografia_invalid_format(client: TestClient, auth_headers, activo_id):
    file_data = io.BytesIO(b"not an image")
    response = client.post(
        f"/api/v1/activos/{activo_id}/fotografias",
        headers=auth_headers,
        files={"file": ("foto.txt", file_data, "text/plain")},
    )
    assert response.status_code == 400


def test_list_and_download_fotografia(client: TestClient, auth_headers, activo_id):
    file_data = io.BytesIO(PNG_1x1)
    upload_response = client.post(
        f"/api/v1/activos/{activo_id}/fotografias",
        headers=auth_headers,
        files={"file": ("foto.png", file_data, "image/png")},
    )
    foto_id = upload_response.json()["id"]

    list_response = client.get(
        f"/api/v1/activos/{activo_id}/fotografias",
        headers=auth_headers,
    )
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    download_response = client.get(
        f"/api/v1/fotografias/{foto_id}/archivo",
        headers=auth_headers,
    )
    assert download_response.status_code == 200
    assert download_response.headers["content-type"] == "image/png"
    assert download_response.content == PNG_1x1


def test_delete_fotografia(client: TestClient, auth_headers, activo_id):
    file_data = io.BytesIO(PNG_1x1)
    upload_response = client.post(
        f"/api/v1/activos/{activo_id}/fotografias",
        headers=auth_headers,
        files={"file": ("foto.png", file_data, "image/png")},
    )
    foto_id = upload_response.json()["id"]

    delete_response = client.delete(
        f"/api/v1/fotografias/{foto_id}",
        headers=auth_headers,
    )
    assert delete_response.status_code == 204

    list_response = client.get(
        f"/api/v1/activos/{activo_id}/fotografias",
        headers=auth_headers,
    )
    assert list_response.json() == []
