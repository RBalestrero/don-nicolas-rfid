"""Crea el usuario administrador inicial."""

import uuid

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.modules.auth.models import Rol, Usuario

ADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000010")
ADMIN_EMAIL = "admin@donnicolas.com"
ADMIN_PASSWORD = "admin123"
ADMIN_ROLE_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def seed_admin() -> None:
    db = SessionLocal()
    try:
        existing = db.scalars(select(Usuario).where(Usuario.email == ADMIN_EMAIL)).first()
        if existing:
            print(f"Usuario admin ya existe: {ADMIN_EMAIL}")
            return

        admin_role = db.get(Rol, ADMIN_ROLE_ID)
        if not admin_role:
            raise RuntimeError("Rol admin no encontrado. Ejecutá las migraciones primero.")

        admin = Usuario(
            id=ADMIN_ID,
            email=ADMIN_EMAIL,
            nombre="Administrador",
            password_hash=hash_password(ADMIN_PASSWORD),
            activo=True,
            rol_id=ADMIN_ROLE_ID,
        )
        db.add(admin)
        db.commit()
        print(f"Usuario admin creado: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_admin()
