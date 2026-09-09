from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.security import verify_password
from app.modules.auth.models import Rol, Usuario


class AuthRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> Usuario | None:
        stmt = (
            select(Usuario)
            .options(joinedload(Usuario.rol).selectinload(Rol.permisos))
            .where(Usuario.email == email)
        )
        return self.db.scalars(stmt).first()


class AuthService:
    def __init__(self, db: Session):
        self.repository = AuthRepository(db)

    def authenticate(self, email: str, password: str) -> Usuario | None:
        user = self.repository.get_by_email(email)
        if not user or not user.activo:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user
