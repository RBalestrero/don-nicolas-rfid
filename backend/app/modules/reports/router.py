import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.modules.auth.models import Usuario
from app.modules.reports.export_service import ExportService
from app.modules.reports.schemas import DashboardResumen, MovimientosPage
from app.modules.reports.service import ReportsService

router = APIRouter(tags=["Reportes"])


@router.get("/dashboard/resumen", response_model=DashboardResumen)
def get_dashboard_resumen(
    movimientos_limit: int = Query(20, ge=1, le=50),
    ops_limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return ReportsService(db).dashboard_resumen(
        movimientos_limit=movimientos_limit,
        ops_limit=ops_limit,
    )


@router.get("/movimientos", response_model=MovimientosPage)
def list_movimientos(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    accion: str | None = Query(None, description="Filtro por tipo de acción"),
    activo_id: uuid.UUID | None = None,
    usuario_id: uuid.UUID | None = None,
    desde: datetime | None = None,
    hasta: datetime | None = None,
    search: str | None = Query(None, description="Número patrimonial o descripción"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return ReportsService(db).list_movimientos(
        limit=limit,
        offset=offset,
        accion=accion,
        activo_id=activo_id,
        usuario_id=usuario_id,
        desde=desde,
        hasta=hasta,
        search=search,
    )


@router.get("/reportes/movimientos")
def export_movimientos(
    formato: str = Query("xlsx", description="csv | xlsx"),
    accion: str | None = None,
    activo_id: uuid.UUID | None = None,
    usuario_id: uuid.UUID | None = None,
    desde: datetime | None = None,
    hasta: datetime | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Response:
    return ExportService(db).export_movimientos(
        formato=formato,
        accion=accion,
        activo_id=activo_id,
        usuario_id=usuario_id,
        desde=desde,
        hasta=hasta,
        search=search,
    )


@router.get("/reportes/stock/{deposito_id}")
def export_stock(
    deposito_id: uuid.UUID,
    formato: str = Query("xlsx", description="csv | xlsx"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Response:
    return ExportService(db).export_stock(deposito_id, formato=formato)


@router.get("/reportes/inventarios/{inventario_id}")
def export_inventario(
    inventario_id: uuid.UUID,
    formato: str = Query("xlsx", description="csv | xlsx | pdf"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Response:
    return ExportService(db).export_inventario(inventario_id, formato=formato)


@router.get("/reportes/transferencias")
def export_transferencias(
    formato: str = Query("xlsx", description="csv | xlsx"),
    estado: str | None = None,
    deposito_origen_id: uuid.UUID | None = None,
    deposito_destino_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Response:
    return ExportService(db).export_transferencias(
        formato=formato,
        estado=estado,
        deposito_origen_id=deposito_origen_id,
        deposito_destino_id=deposito_destino_id,
    )


@router.get("/reportes/transferencias/{transferencia_id}")
def export_transferencia_detalle(
    transferencia_id: uuid.UUID,
    formato: str = Query("xlsx", description="csv | xlsx"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Response:
    return ExportService(db).export_transferencia_detalle(transferencia_id, formato=formato)
