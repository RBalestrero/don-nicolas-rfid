import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import decode_access_token
from app.database import get_db
from app.modules.auth.models import Usuario

security = HTTPBearer()

CLIENT_HEADER = "X-Client"


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> Usuario:
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        ) from None

    stmt = (
        select(Usuario)
        .options(joinedload(Usuario.rol))
        .where(Usuario.id == user_id, Usuario.activo.is_(True))
    )
    user = db.scalars(stmt).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado",
        )

    return user


def require_roles(*roles: str):
    allowed = {r.lower() for r in roles}

    def _dependency(current_user: Usuario = Depends(get_current_user)) -> Usuario:
        rol = (current_user.rol.nombre if current_user.rol else "").lower()
        if rol not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FORBIDDEN_ROLE",
                    "message": "No tenés permisos para esta operación",
                },
            )
        return current_user

    return _dependency
