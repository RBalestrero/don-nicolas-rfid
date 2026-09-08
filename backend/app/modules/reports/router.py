import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.modules.auth.models import Usuario
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
