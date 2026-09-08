import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.security import hash_password
from app.database import SessionLocal
from app.main import app
from app.modules.assets.models import Activo
from app.modules.auth.models import Usuario
from app.modules.transfers.models import DetalleTransferencia, Transferencia

ADMIN_EMAIL = "test-admin@donnicolas.com"
ADMIN_PASSWORD = "testpass123"
ADMIN_ROLE_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def _cleanup_user_activos(db, user_id: uuid.UUID) -> None:
    activo_ids = list(
        db.scalars(select(Activo.id).where(Activo.creado_por_id == user_id)).all()
    )
    if activo_ids:
        xfer_ids = list(
            db.scalars(
                select(DetalleTransferencia.transferencia_id).where(
                    DetalleTransferencia.activo_id.in_(activo_ids)
                )
            ).all()
        )
        if xfer_ids:
            db.execute(
                delete(DetalleTransferencia).where(
                    DetalleTransferencia.transferencia_id.in_(xfer_ids)
                )
            )
            db.execute(delete(Transferencia).where(Transferencia.id.in_(xfer_ids)))
        db.execute(delete(Activo).where(Activo.id.in_(activo_ids)))
    db.commit()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def admin_user():
    db = SessionLocal()
    existing = db.scalars(select(Usuario).where(Usuario.email == ADMIN_EMAIL)).first()
    if existing:
        _cleanup_user_activos(db, existing.id)
        db.delete(existing)
        db.commit()

    user = Usuario(
        id=uuid.uuid4(),
        email=ADMIN_EMAIL,
        nombre="Test Admin",
        password_hash=hash_password(ADMIN_PASSWORD),
        activo=True,
        rol_id=ADMIN_ROLE_ID,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user
    _cleanup_user_activos(db, user.id)
    db.delete(user)
    db.commit()
    db.close()


@pytest.fixture
def auth_headers(client: TestClient, admin_user) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
