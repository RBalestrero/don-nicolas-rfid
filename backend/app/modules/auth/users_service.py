from __future__ import annotations

import re
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.permissions import PERM_USERS_MANAGE
from app.core.security import hash_password
from app.dependencies import user_has_permission, user_permission_codes
from app.modules.auth.models import Permiso, Rol, Usuario
from app.modules.auth.users_schemas import (
    PermisoResponse,
    RolCreate,
    RolResponse,
    RolUpdate,
    UsuarioAdminResponse,
    UsuarioCreate,
    UsuarioUpdate,
)

_SLUG_RE = re.compile(r"[^a-z0-9_]+")


def _slug_role_name(nombre: str) -> str:
    raw = nombre.strip().lower().replace(" ", "_").replace("-", "_")
    cleaned = _SLUG_RE.sub("", raw)
    return cleaned[:50]


def _to_user_response(user: Usuario) -> UsuarioAdminResponse:
    return UsuarioAdminResponse(
        id=str(user.id),
        email=user.email,
        nombre=user.nombre,
        rol=user.rol.nombre if user.rol else "",
        rol_id=str(user.rol_id),
        activo=user.activo,
        creado_en=user.creado_en,
        actualizado_en=user.actualizado_en,
    )


def _to_rol_response(rol: Rol, usuarios_count: int | None = None) -> RolResponse:
    count = usuarios_count
    if count is None:
        count = len(rol.usuarios) if rol.usuarios is not None else 0
    return RolResponse(
        id=str(rol.id),
        nombre=rol.nombre,
        descripcion=rol.descripcion,
        es_sistema=bool(rol.es_sistema),
        permisos=sorted({p.codigo for p in (rol.permisos or [])}),
        usuarios_count=count,
    )


class UsersService:
    def __init__(self, db: Session):
        self.db = db

    def list_permisos(self) -> list[PermisoResponse]:
        rows = self.db.scalars(select(Permiso).order_by(Permiso.modulo, Permiso.codigo)).all()
        return [
            PermisoResponse(
                id=str(p.id),
                codigo=p.codigo,
                nombre=p.nombre,
                descripcion=p.descripcion,
                modulo=p.modulo,
            )
            for p in rows
        ]

    def list_roles(self) -> list[RolResponse]:
        roles = self.db.scalars(
            select(Rol).options(selectinload(Rol.permisos)).order_by(Rol.nombre)
        ).unique().all()
        counts = dict(
            self.db.execute(
                select(Usuario.rol_id, func.count()).group_by(Usuario.rol_id)
            ).all()
        )
        return [_to_rol_response(r, int(counts.get(r.id, 0))) for r in roles]

    def get_rol(self, rol_id: uuid.UUID) -> Rol:
        rol = self.db.scalars(
            select(Rol).options(selectinload(Rol.permisos)).where(Rol.id == rol_id)
        ).first()
        if not rol:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "ROLE_NOT_FOUND", "message": "Rol no encontrado"},
            )
        return rol

    def _permisos_by_codigos(self, codigos: list[str]) -> list[Permiso]:
        wanted = sorted({c.strip().lower() for c in codigos if c and c.strip()})
        if not wanted:
            return []
        found = list(
            self.db.scalars(select(Permiso).where(func.lower(Permiso.codigo).in_(wanted))).all()
        )
        found_codes = {p.codigo.lower() for p in found}
        missing = [c for c in wanted if c not in found_codes]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "PERMISSION_INVALID",
                    "message": f"Permisos inválidos: {', '.join(missing)}",
                },
            )
        return found

    def create_rol(self, data: RolCreate) -> RolResponse:
        nombre = _slug_role_name(data.nombre)
        if len(nombre) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "ROLE_NAME_INVALID", "message": "Nombre de rol inválido"},
            )
        exists = self.db.scalars(select(Rol).where(func.lower(Rol.nombre) == nombre)).first()
        if exists:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ROLE_EXISTS", "message": "Ya existe un rol con ese nombre"},
            )
        rol = Rol(
            nombre=nombre,
            descripcion=(data.descripcion or "").strip() or None,
            es_sistema=False,
            permisos=self._permisos_by_codigos(data.permisos),
        )
        self.db.add(rol)
        self.db.commit()
        return _to_rol_response(self.get_rol(rol.id), 0)

    def update_rol(self, rol_id: uuid.UUID, data: RolUpdate) -> RolResponse:
        rol = self.get_rol(rol_id)
        payload = data.model_dump(exclude_unset=True)

        if "nombre" in payload and payload["nombre"] is not None:
            if rol.es_sistema:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "ROLE_SYSTEM_RENAME",
                        "message": "No se puede renombrar un rol de sistema",
                    },
                )
            nombre = _slug_role_name(str(payload["nombre"]))
            if len(nombre) < 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "ROLE_NAME_INVALID", "message": "Nombre de rol inválido"},
                )
            clash = self.db.scalars(
                select(Rol).where(func.lower(Rol.nombre) == nombre, Rol.id != rol.id)
            ).first()
            if clash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "ROLE_EXISTS", "message": "Ya existe un rol con ese nombre"},
                )
            rol.nombre = nombre

        if "descripcion" in payload:
            desc = payload["descripcion"]
            rol.descripcion = (str(desc).strip() if desc is not None else None) or None

        if "permisos" in payload and payload["permisos"] is not None:
            new_perms = self._permisos_by_codigos(list(payload["permisos"]))
            # Evitar dejar el sistema sin nadie que gestione usuarios
            had_users_manage = any(p.codigo == PERM_USERS_MANAGE for p in (rol.permisos or []))
            will_have = any(p.codigo == PERM_USERS_MANAGE for p in new_perms)
            if had_users_manage and not will_have:
                others = self._count_active_users_with_perm(PERM_USERS_MANAGE, exclude_rol_id=rol.id)
                if others < 1:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "code": "ROLE_LAST_USERS_MANAGE",
                            "message": "Debe quedar al menos un rol activo con permiso users.manage",
                        },
                    )
            rol.permisos = new_perms

        self.db.commit()
        return _to_rol_response(self.get_rol(rol.id))

    def delete_rol(self, rol_id: uuid.UUID) -> None:
        rol = self.get_rol(rol_id)
        if rol.es_sistema:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "ROLE_SYSTEM_DELETE",
                    "message": "No se puede eliminar un rol de sistema",
                },
            )
        users = self.db.scalar(
            select(func.count()).select_from(Usuario).where(Usuario.rol_id == rol.id)
        )
        if int(users or 0) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "ROLE_HAS_USERS",
                    "message": "Reasigná los usuarios antes de eliminar el rol",
                },
            )
        self.db.delete(rol)
        self.db.commit()

    def list_users(self, include_inactive: bool = True) -> list[UsuarioAdminResponse]:
        stmt = select(Usuario).options(joinedload(Usuario.rol)).order_by(Usuario.nombre)
        if not include_inactive:
            stmt = stmt.where(Usuario.activo.is_(True))
        users = self.db.scalars(stmt).unique().all()
        return [_to_user_response(u) for u in users]

    def get_user(self, user_id: uuid.UUID) -> Usuario:
        user = self.db.scalars(
            select(Usuario)
            .options(joinedload(Usuario.rol).selectinload(Rol.permisos))
            .where(Usuario.id == user_id)
        ).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "Usuario no encontrado"},
            )
        return user

    def get_user_response(self, user_id: uuid.UUID) -> UsuarioAdminResponse:
        return _to_user_response(self.get_user(user_id))

    def _get_role_by_name(self, nombre: str) -> Rol:
        role = self.db.scalars(
            select(Rol)
            .options(selectinload(Rol.permisos))
            .where(func.lower(Rol.nombre) == nombre.lower())
        ).first()
        if not role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "ROLE_INVALID", "message": f"Rol inválido: {nombre}"},
            )
        return role

    def _ensure_email_unique(self, email: str, exclude_id: uuid.UUID | None = None) -> None:
        stmt = select(Usuario).where(func.lower(Usuario.email) == email.lower())
        if exclude_id:
            stmt = stmt.where(Usuario.id != exclude_id)
        if self.db.scalars(stmt).first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "USER_EMAIL_EXISTS", "message": "Ya existe un usuario con ese email"},
            )

    def _count_active_users_with_perm(
        self,
        codigo: str,
        exclude_id: uuid.UUID | None = None,
        exclude_rol_id: uuid.UUID | None = None,
    ) -> int:
        stmt = (
            select(func.count())
            .select_from(Usuario)
            .join(Rol)
            .join(Rol.permisos)
            .where(
                Usuario.activo.is_(True),
                func.lower(Permiso.codigo) == codigo.lower(),
            )
        )
        if exclude_id:
            stmt = stmt.where(Usuario.id != exclude_id)
        if exclude_rol_id:
            stmt = stmt.where(Usuario.rol_id != exclude_rol_id)
        return int(self.db.scalar(stmt) or 0)

    def create_user(self, data: UsuarioCreate) -> UsuarioAdminResponse:
        self._ensure_email_unique(data.email)
        role = self._get_role_by_name(data.rol)
        user = Usuario(
            email=data.email.lower().strip(),
            nombre=data.nombre.strip(),
            password_hash=hash_password(data.password),
            activo=data.activo,
            rol_id=role.id,
        )
        self.db.add(user)
        self.db.commit()
        return _to_user_response(self.get_user(user.id))

    def update_user(
        self,
        user_id: uuid.UUID,
        data: UsuarioUpdate,
        actor: Usuario,
    ) -> UsuarioAdminResponse:
        user = self.get_user(user_id)
        payload = data.model_dump(exclude_unset=True)

        if "email" in payload and payload["email"] is not None:
            self._ensure_email_unique(payload["email"], exclude_id=user.id)
            user.email = str(payload["email"]).lower().strip()

        if "nombre" in payload and payload["nombre"] is not None:
            user.nombre = str(payload["nombre"]).strip()

        if "password" in payload and payload["password"]:
            user.password_hash = hash_password(str(payload["password"]))

        if "rol" in payload and payload["rol"] is not None:
            role = self._get_role_by_name(str(payload["rol"]))
            user.rol_id = role.id

        if "activo" in payload and payload["activo"] is not None:
            nuevo_activo = bool(payload["activo"])
            if user.activo and not nuevo_activo:
                if str(user.id) == str(actor.id):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "code": "USER_SELF_DEACTIVATE",
                            "message": "No podés desactivar tu propio usuario",
                        },
                    )
                if user_has_permission(user, PERM_USERS_MANAGE):
                    if self._count_active_users_with_perm(PERM_USERS_MANAGE, exclude_id=user.id) < 1:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail={
                                "code": "USER_LAST_ADMIN",
                                "message": "Debe quedar al menos un usuario activo con users.manage",
                            },
                        )
            user.activo = nuevo_activo

        self.db.flush()
        # Recargar permisos del rol nuevo
        user = self.get_user(user.id)
        if self._count_active_users_with_perm(PERM_USERS_MANAGE) < 1:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "USER_LAST_ADMIN",
                    "message": "Debe quedar al menos un usuario activo con users.manage",
                },
            )

        self.db.commit()
        return _to_user_response(self.get_user(user.id))


def permissions_for_user(user: Usuario) -> list[str]:
    return sorted(user_permission_codes(user))
