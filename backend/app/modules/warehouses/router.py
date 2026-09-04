import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.modules.auth.models import Usuario
from app.modules.warehouses.asignacion_service import AsignacionService
from app.modules.warehouses.schemas import (
    DepositoCreate,
    DepositoDetalleResponse,
    DepositoResponse,
    DepositoUpdate,
    SectorCreate,
    SectorDetalleResponse,
    SectorResponse,
    SectorUpdate,
    StockDepositoResponse,
    StockUbicacionResponse,
    UbicacionCreate,
    UbicacionResponse,
    UbicacionUpdate,
)
from app.modules.warehouses.service import DepositoService, SectorService, UbicacionService
from app.modules.warehouses.stock_service import StockService

router = APIRouter(tags=["Depósitos"])


@router.get("/depositos", response_model=list[DepositoResponse])
def list_depositos(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = DepositoService(db)
    return service.list_depositos(include_inactive=include_inactive)


@router.post("/depositos", response_model=DepositoResponse, status_code=status.HTTP_201_CREATED)
def create_deposito(
    data: DepositoCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = DepositoService(db)
    return service.create_deposito(data)


@router.get("/depositos/{deposito_id}", response_model=DepositoDetalleResponse)
def get_deposito(
    deposito_id: uuid.UUID,
    include_tree: bool = Query(False, description="Incluir sectores y ubicaciones"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = DepositoService(db)
    deposito = service.get_deposito(deposito_id, with_tree=include_tree)
    if not include_tree:
        return DepositoDetalleResponse.model_validate(deposito)
    return DepositoDetalleResponse(
        id=deposito.id,
        nombre=deposito.nombre,
        descripcion=deposito.descripcion,
        direccion=deposito.direccion,
        activo=deposito.activo,
        creado_en=deposito.creado_en,
        actualizado_en=deposito.actualizado_en,
        sectores=[
            SectorDetalleResponse(
                id=s.id,
                deposito_id=s.deposito_id,
                nombre=s.nombre,
                descripcion=s.descripcion,
                activo=s.activo,
                creado_en=s.creado_en,
                actualizado_en=s.actualizado_en,
                ubicaciones=[UbicacionResponse.model_validate(u) for u in s.ubicaciones if u.activo],
            )
            for s in deposito.sectores
            if s.activo
        ],
    )


@router.put("/depositos/{deposito_id}", response_model=DepositoResponse)
def update_deposito(
    deposito_id: uuid.UUID,
    data: DepositoUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = DepositoService(db)
    return service.update_deposito(deposito_id, data)


@router.delete("/depositos/{deposito_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_deposito(
    deposito_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = DepositoService(db)
    service.delete_deposito(deposito_id)


@router.get("/depositos/{deposito_id}/sectores", response_model=list[SectorResponse])
def list_sectores(
    deposito_id: uuid.UUID,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = SectorService(db)
    return service.list_sectores(deposito_id, include_inactive=include_inactive)


@router.post(
    "/depositos/{deposito_id}/sectores",
    response_model=SectorResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_sector(
    deposito_id: uuid.UUID,
    data: SectorCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = SectorService(db)
    return service.create_sector(deposito_id, data)


@router.get("/depositos/{deposito_id}/sectores/{sector_id}", response_model=SectorResponse)
def get_sector(
    deposito_id: uuid.UUID,
    sector_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = SectorService(db)
    return service.get_sector(deposito_id, sector_id)


@router.put("/depositos/{deposito_id}/sectores/{sector_id}", response_model=SectorResponse)
def update_sector(
    deposito_id: uuid.UUID,
    sector_id: uuid.UUID,
    data: SectorUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = SectorService(db)
    return service.update_sector(deposito_id, sector_id, data)


@router.delete(
    "/depositos/{deposito_id}/sectores/{sector_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_sector(
    deposito_id: uuid.UUID,
    sector_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = SectorService(db)
    service.delete_sector(deposito_id, sector_id)


@router.get(
    "/depositos/{deposito_id}/sectores/{sector_id}/ubicaciones",
    response_model=list[UbicacionResponse],
)
def list_ubicaciones(
    deposito_id: uuid.UUID,
    sector_id: uuid.UUID,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = UbicacionService(db)
    return service.list_ubicaciones(
        deposito_id, sector_id, include_inactive=include_inactive
    )


@router.post(
    "/depositos/{deposito_id}/sectores/{sector_id}/ubicaciones",
    response_model=UbicacionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_ubicacion(
    deposito_id: uuid.UUID,
    sector_id: uuid.UUID,
    data: UbicacionCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = UbicacionService(db)
    return service.create_ubicacion(deposito_id, sector_id, data)


@router.get(
    "/depositos/{deposito_id}/sectores/{sector_id}/ubicaciones/{ubicacion_id}",
    response_model=UbicacionResponse,
)
def get_ubicacion(
    deposito_id: uuid.UUID,
    sector_id: uuid.UUID,
    ubicacion_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = UbicacionService(db)
    return service.get_ubicacion(deposito_id, sector_id, ubicacion_id)


@router.put(
    "/depositos/{deposito_id}/sectores/{sector_id}/ubicaciones/{ubicacion_id}",
    response_model=UbicacionResponse,
)
def update_ubicacion(
    deposito_id: uuid.UUID,
    sector_id: uuid.UUID,
    ubicacion_id: uuid.UUID,
    data: UbicacionUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = UbicacionService(db)
    return service.update_ubicacion(deposito_id, sector_id, ubicacion_id, data)


@router.delete(
    "/depositos/{deposito_id}/sectores/{sector_id}/ubicaciones/{ubicacion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_ubicacion(
    deposito_id: uuid.UUID,
    sector_id: uuid.UUID,
    ubicacion_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = UbicacionService(db)
    service.delete_ubicacion(deposito_id, sector_id, ubicacion_id)


@router.get("/ubicaciones/{ubicacion_id}/stock", response_model=StockUbicacionResponse)
def get_stock_ubicacion(
    ubicacion_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = AsignacionService(db)
    return service.get_stock_ubicacion(ubicacion_id)


@router.get("/depositos/{deposito_id}/stock", response_model=StockDepositoResponse)
def get_stock_deposito(
    deposito_id: uuid.UUID,
    sector_id: uuid.UUID | None = None,
    ubicacion_id: uuid.UUID | None = None,
    categoria_id: uuid.UUID | None = None,
    search: str | None = Query(None, min_length=1),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = StockService(db)
    return service.get_stock_deposito(
        deposito_id,
        sector_id=sector_id,
        ubicacion_id=ubicacion_id,
        categoria_id=categoria_id,
        search=search,
    )
