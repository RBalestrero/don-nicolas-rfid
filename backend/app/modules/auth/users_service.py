from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.rbac import ROLE_ADMIN
from app.core.security import hash_password
from app.modules.auth.models import Rol, Usuario
from app.modules.auth.users_schemas import UsuarioAdminResponse, UsuarioCreate, UsuarioUpdate


def _to_response(user: Usuario) -> UsuarioAdminResponse:
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


class UsersService:
    def __init__(self, db: Session):
        self.db = db

    def list_roles(self) -> list[Rol]:
        return list(self.db.scalars(select(Rol).order_by(Rol.nombre)).all())

    def list_users(self, include_inactive: bool = True) -> list[UsuarioAdminResponse]:
        stmt = select(Usuario).options(joinedload(Usuario.rol)).order_by(Usuario.nombre)
        if not include_inactive:
            stmt = stmt.where(Usuario.activo.is_(True))
        users = self.db.scalars(stmt).unique().all()
        return [_to_response(u) for u in users]

    def get_user_response(self, user_id: uuid.UUID) -> UsuarioAdminResponse:
        return _to_response(self.get_user(user_id))

    def get_user(self, user_id: uuid.UUID) -> Usuario:
        user = self.db.scalars(
            select(Usuario).options(joinedload(Usuario.rol)).where(Usuario.id == user_id)
        ).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "Usuario no encontrado"},
            )
        return user

    def _get_role_by_name(self, nombre: str) -> Rol:
        role = self.db.scalars(select(Rol).where(func.lower(Rol.nombre) == nombre.lower())).first()
        if not role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "ROLE_INVALID",
                    "message": f"Rol inválido: {nombre}",
                },
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

    def _count_active_admins(self, exclude_id: uuid.UUID | None = None) -> int:
        stmt = (
            select(func.count())
            .select_from(Usuario)
            .join(Rol)
            .where(Usuario.activo.is_(True), func.lower(Rol.nombre) == ROLE_ADMIN)
        )
        if exclude_id:
            stmt = stmt.where(Usuario.id != exclude_id)
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
        self.db.refresh(user)
        user = self.get_user(user.id)
        return _to_response(user)

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

        new_role_name = payload.get("rol")
        if new_role_name is not None:
            role = self._get_role_by_name(str(new_role_name))
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
                if (user.rol.nombre if user.rol else "").lower() == ROLE_ADMIN:
                    if self._count_active_admins(exclude_id=user.id) < 1:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail={
                                "code": "USER_LAST_ADMIN",
                                "message": "Debe quedar al menos un administrador activo",
                            },
                        )
            user.activo = nuevo_activo

        # Evitar degradar el último admin
        if new_role_name is not None:
            self.db.flush()
            self.db.refresh(user, attribute_names=["rol"])
            if self._count_active_admins() < 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "USER_LAST_ADMIN",
                        "message": "Debe quedar al menos un administrador activo",
                    },
                )

        self.db.commit()
        user = self.get_user(user.id)
        return _to_response(user)
