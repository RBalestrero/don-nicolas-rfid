"""Fixtures pytest — usan BD de test aislada para no contaminar desarrollo."""

from __future__ import annotations

import os
import uuid

# ---------------------------------------------------------------------------
# IMPORTANTE: forzar BD de test ANTES de importar la app / settings.
# En CI el Postgres del workflow es efímero; en local evitamos don_nicolas_rfid.
# ---------------------------------------------------------------------------
_IN_CI = bool(os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"))
if not _IN_CI:
    os.environ["POSTGRES_DB"] = os.environ.get(
        "POSTGRES_TEST_DB", "don_nicolas_rfid_test"
    )


def _ensure_test_database() -> None:
    """Crea la BD de test si no existe (solo local)."""
    if _IN_CI:
        return

    import sqlalchemy as sa

    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", "5432")
    user = os.environ.get("POSTGRES_USER", "rfid_admin")
    password = os.environ.get("POSTGRES_PASSWORD", "changeme")
    dbname = os.environ["POSTGRES_DB"]

    admin_url = f"postgresql://{user}:{password}@{host}:{port}/postgres"
    engine = sa.create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        exists = conn.execute(
            sa.text("SELECT 1 FROM pg_database WHERE datname = :n"),
            {"n": dbname},
        ).scalar()
        if not exists:
            conn.execute(sa.text(f'CREATE DATABASE "{dbname}"'))
    engine.dispose()


def _reset_settings_and_engine() -> None:
    """Recarga settings/engine tras cambiar POSTGRES_DB."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.config import get_settings
    from app import database as dbmod

    get_settings.cache_clear()
    settings = get_settings()
    dbmod.engine.dispose()
    dbmod.engine = create_engine(settings.database_url, pool_pre_ping=True)
    dbmod.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=dbmod.engine)


def _run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")


_ensure_test_database()
_reset_settings_and_engine()
_run_migrations()

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


@pytest.fixture
def mobile_auth_headers(auth_headers: dict[str, str]) -> dict[str, str]:
    return {**auth_headers, "X-Client": "mc33"}


@pytest.fixture(autouse=True)
def reset_security_state():
    from app.core.rate_limit import api_rate_limiter, login_lockout, login_rate_limiter

    api_rate_limiter.clear()
    login_rate_limiter.clear()
    login_lockout.clear()
    yield
    api_rate_limiter.clear()
    login_rate_limiter.clear()
    login_lockout.clear()
