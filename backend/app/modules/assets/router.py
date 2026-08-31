import uuid

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.modules.assets.fotografias_service import FotografiaService
from app.modules.assets.schemas import (
    ActivoCreate,
    ActivoResponse,
    ActivoUpdate,
    CategoriaCreate,
    CategoriaResponse,
    CategoriaUpdate,
    FotografiaResponse,
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


@router.post(
    "/activos/{activo_id}/fotografias",
    response_model=FotografiaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_fotografia(
    activo_id: uuid.UUID,
    file: UploadFile = File(...),
    es_principal: bool = False,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = FotografiaService(db)
    return await service.upload(activo_id, file, es_principal=es_principal)


@router.get("/activos/{activo_id}/fotografias", response_model=list[FotografiaResponse])
def list_fotografias(
    activo_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = FotografiaService(db)
    return service.list_fotografias(activo_id)


@router.get("/fotografias/{foto_id}/archivo")
def get_fotografia_archivo(
    foto_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = FotografiaService(db)
    path, mime_type = service.get_file_path(foto_id)
    return FileResponse(path, media_type=mime_type, filename=path.name)


@router.delete("/fotografias/{foto_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fotografia(
    foto_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = FotografiaService(db)
    service.delete_fotografia(foto_id)
