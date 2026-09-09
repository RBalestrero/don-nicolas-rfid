import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.security import decode_access_token
from app.database import get_db
from app.modules.auth.models import Rol, Usuario

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
        .options(joinedload(Usuario.rol).selectinload(Rol.permisos))
        .where(Usuario.id == user_id, Usuario.activo.is_(True))
    )
    user = db.scalars(stmt).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado",
        )

    return user


def user_permission_codes(user: Usuario) -> set[str]:
    if not user.rol:
        return set()
    return {(p.codigo or "").strip().lower() for p in (user.rol.permisos or []) if p.codigo}


def user_has_permission(user: Usuario, *codes: str) -> bool:
    owned = user_permission_codes(user)
    needed = {c.strip().lower() for c in codes if c}
    return bool(needed) and needed.issubset(owned)


def require_roles(*roles: str):
    """Compatibilidad: valida por nombre de rol (preferir require_permission)."""
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


def require_permission(*codes: str):
    """Exige que el rol del usuario tenga TODOS los códigos indicados."""
    needed = tuple(c.strip().lower() for c in codes if c)

    def _dependency(current_user: Usuario = Depends(get_current_user)) -> Usuario:
        if not user_has_permission(current_user, *needed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FORBIDDEN_PERMISSION",
                    "message": "No tenés permisos para esta operación",
                    "required": list(needed),
                },
            )
        return current_user

    return _dependency


def require_any_permission(*codes: str):
    """Exige al menos uno de los códigos indicados."""
    options = tuple(c.strip().lower() for c in codes if c)

    def _dependency(current_user: Usuario = Depends(get_current_user)) -> Usuario:
        owned = user_permission_codes(current_user)
        if not owned.intersection(options):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FORBIDDEN_PERMISSION",
                    "message": "No tenés permisos para esta operación",
                    "required_any": list(options),
                },
            )
        return current_user

    return _dependency
