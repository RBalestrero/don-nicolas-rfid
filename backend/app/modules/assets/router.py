import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.modules.assets.schemas import (
    ActivoCreate,
    ActivoResponse,
    ActivoUpdate,
    CategoriaCreate,
    CategoriaResponse,
    CategoriaUpdate,
)
from app.modules.assets.service import ActivoService, CategoriaService
from app.modules.auth.models import Usuario

router = APIRouter(tags=["Activos"])


@router.get("/categorias", response_model=list[CategoriaResponse])
def list_categorias(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = CategoriaService(db)
    return service.list_categorias(include_inactive=include_inactive)


@router.post("/categorias", response_model=CategoriaResponse, status_code=status.HTTP_201_CREATED)
def create_categoria(
    data: CategoriaCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = CategoriaService(db)
    return service.create_categoria(data)


@router.get("/categorias/{categoria_id}", response_model=CategoriaResponse)
def get_categoria(
    categoria_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = CategoriaService(db)
    return service.get_categoria(categoria_id)


@router.put("/categorias/{categoria_id}", response_model=CategoriaResponse)
def update_categoria(
    categoria_id: uuid.UUID,
    data: CategoriaUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = CategoriaService(db)
    return service.update_categoria(categoria_id, data)


@router.delete("/categorias/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_categoria(
    categoria_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = CategoriaService(db)
    service.delete_categoria(categoria_id)


@router.get("/activos", response_model=list[ActivoResponse])
def list_activos(
    categoria_id: uuid.UUID | None = None,
    search: str | None = Query(None, min_length=1),
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = ActivoService(db)
    return service.list_activos(
        categoria_id=categoria_id,
        search=search,
        include_inactive=include_inactive,
    )


@router.post("/activos", response_model=ActivoResponse, status_code=status.HTTP_201_CREATED)
def create_activo(
    data: ActivoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    service = ActivoService(db)
    return service.create_activo(data, current_user)


@router.get("/activos/{activo_id}", response_model=ActivoResponse)
def get_activo(
    activo_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = ActivoService(db)
    return service.get_activo(activo_id)


@router.put("/activos/{activo_id}", response_model=ActivoResponse)
def update_activo(
    activo_id: uuid.UUID,
    data: ActivoUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = ActivoService(db)
    return service.update_activo(activo_id, data)


@router.delete("/activos/{activo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activo(
    activo_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = ActivoService(db)
    service.delete_activo(activo_id)
