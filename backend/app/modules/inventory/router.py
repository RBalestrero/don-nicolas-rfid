import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.rbac import require_inventory_audit, require_inventory_write
from app.dependencies import get_current_user
from app.modules.auth.models import Usuario
from app.modules.inventory.schemas import (
    InventarioAuditarRequest,
    InventarioCerrarRequest,
    InventarioCreate,
    InventarioDescartarRequest,
    InventarioLecturasRequest,
    InventarioListItem,
    InventarioReporteResponse,
    InventarioResponse,
)
from app.modules.inventory.service import InventoryService

router = APIRouter(tags=["Inventario"])


@router.post("/inventarios", response_model=InventarioResponse, status_code=status.HTTP_201_CREATED)
def create_inventario(
    data: InventarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_inventory_write),
):
    return InventoryService(db).create(data, current_user.id)


@router.get("/inventarios", response_model=list[InventarioListItem])
def list_inventarios(
    deposito_id: uuid.UUID | None = None,
    estado: str | None = Query(
        None, description="en_curso | cerrado | cancelado | descartado"
    ),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return InventoryService(db).list_inventarios(
        deposito_id=deposito_id,
        estado=estado,
        limit=limit,
    )


@router.get("/inventarios/{inventario_id}", response_model=InventarioResponse)
def get_inventario(
    inventario_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return InventoryService(db).get(inventario_id)


@router.get("/inventarios/{inventario_id}/reporte", response_model=InventarioReporteResponse)
def get_inventario_reporte(
    inventario_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return InventoryService(db).reporte(inventario_id)


@router.post("/inventarios/{inventario_id}/lecturas", response_model=InventarioResponse)
def registrar_lecturas(
    inventario_id: uuid.UUID,
    data: InventarioLecturasRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_inventory_write),
):
    return InventoryService(db).registrar_lecturas(inventario_id, data)


@router.post("/inventarios/{inventario_id}/lecturas/reset", response_model=InventarioResponse)
def resetear_lecturas(
    inventario_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_inventory_write),
):
    """Borra lecturas de un inventario en curso para reintentar el conteo (MC33)."""
    return InventoryService(db).resetear_lecturas(inventario_id)


@router.post("/inventarios/{inventario_id}/cerrar", response_model=InventarioResponse)
def cerrar_inventario(
    inventario_id: uuid.UUID,
    data: InventarioCerrarRequest | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_inventory_write),
):
    return InventoryService(db).cerrar(
        inventario_id,
        data or InventarioCerrarRequest(),
        usuario=current_user,
    )


@router.post("/inventarios/{inventario_id}/cancelar", response_model=InventarioResponse)
def cancelar_inventario(
    inventario_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_inventory_write),
):
    """Cancela un inventario en curso (MC33). No marca faltantes."""
    return InventoryService(db).cancelar(inventario_id)


@router.post("/inventarios/{inventario_id}/auditar", response_model=InventarioResponse)
def auditar_inventario(
    inventario_id: uuid.UUID,
    data: InventarioAuditarRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_inventory_audit),
):
    """Confirma auditoría web: aplica ajuste de stock por faltantes (sin exigir MC33)."""
    return InventoryService(db).auditar(inventario_id, data, current_user)


@router.post("/inventarios/{inventario_id}/descartar", response_model=InventarioResponse)
def descartar_inventario(
    inventario_id: uuid.UUID,
    data: InventarioDescartarRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_inventory_audit),
):
    """Descarta un inventario cerrado inválido sin ajustar stock (web; no exige MC33)."""
    return InventoryService(db).descartar(inventario_id, data, current_user)
