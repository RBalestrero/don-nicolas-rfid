import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.rbac import require_admin
from app.database import get_db
from app.modules.auth.models import Usuario
from app.modules.auth.users_schemas import (
    RolResponse,
    UsuarioAdminResponse,
    UsuarioCreate,
    UsuarioUpdate,
)
from app.modules.auth.users_service import UsersService

router = APIRouter(tags=["Usuarios"])


@router.get("/roles", response_model=list[RolResponse])
def list_roles(
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    roles = UsersService(db).list_roles()
    return [
        RolResponse(id=str(r.id), nombre=r.nombre, descripcion=r.descripcion) for r in roles
    ]


@router.get("/usuarios", response_model=list[UsuarioAdminResponse])
def list_usuarios(
    include_inactive: bool = Query(True),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    return UsersService(db).list_users(include_inactive=include_inactive)


@router.post("/usuarios", response_model=UsuarioAdminResponse, status_code=status.HTTP_201_CREATED)
def create_usuario(
    data: UsuarioCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    return UsersService(db).create_user(data)


@router.get("/usuarios/{usuario_id}", response_model=UsuarioAdminResponse)
def get_usuario(
    usuario_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    return UsersService(db).get_user_response(usuario_id)


@router.patch("/usuarios/{usuario_id}", response_model=UsuarioAdminResponse)
def update_usuario(
    usuario_id: uuid.UUID,
    data: UsuarioUpdate,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(require_admin),
):
    return UsersService(db).update_user(usuario_id, data, actor)
