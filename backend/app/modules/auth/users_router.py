import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.rbac import require_roles_manage, require_users_manage, require_users_or_roles_manage
from app.database import get_db
from app.modules.auth.models import Usuario
from app.modules.auth.users_schemas import (
    PermisoResponse,
    RolCreate,
    RolResponse,
    RolUpdate,
    UsuarioAdminResponse,
    UsuarioCreate,
    UsuarioUpdate,
)
from app.modules.auth.users_service import UsersService

router = APIRouter(tags=["Usuarios"])


@router.get("/permisos", response_model=list[PermisoResponse])
def list_permisos(
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles_manage),
):
    return UsersService(db).list_permisos()


@router.get("/roles", response_model=list[RolResponse])
def list_roles(
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_users_or_roles_manage),
):
    """Listado de roles (users.manage o roles.manage)."""
    return UsersService(db).list_roles()


@router.post("/roles", response_model=RolResponse, status_code=status.HTTP_201_CREATED)
def create_rol(
    data: RolCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles_manage),
):
    return UsersService(db).create_rol(data)


@router.patch("/roles/{rol_id}", response_model=RolResponse)
def update_rol(
    rol_id: uuid.UUID,
    data: RolUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles_manage),
):
    return UsersService(db).update_rol(rol_id, data)


@router.delete("/roles/{rol_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rol(
    rol_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles_manage),
):
    UsersService(db).delete_rol(rol_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/usuarios", response_model=list[UsuarioAdminResponse])
def list_usuarios(
    include_inactive: bool = Query(True),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_users_manage),
):
    return UsersService(db).list_users(include_inactive=include_inactive)


@router.post("/usuarios", response_model=UsuarioAdminResponse, status_code=status.HTTP_201_CREATED)
def create_usuario(
    data: UsuarioCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_users_manage),
):
    return UsersService(db).create_user(data)


@router.get("/usuarios/{usuario_id}", response_model=UsuarioAdminResponse)
def get_usuario(
    usuario_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_users_manage),
):
    return UsersService(db).get_user_response(usuario_id)


@router.patch("/usuarios/{usuario_id}", response_model=UsuarioAdminResponse)
def update_usuario(
    usuario_id: uuid.UUID,
    data: UsuarioUpdate,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(require_users_manage),
):
    return UsersService(db).update_user(usuario_id, data, actor)
