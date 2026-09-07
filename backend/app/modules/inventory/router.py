import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.modules.auth.models import Usuario
from app.modules.inventory.schemas import (
    InventarioCerrarRequest,
    InventarioCreate,
    InventarioLecturasRequest,
    InventarioResponse,
)
from app.modules.inventory.service import InventoryService

router = APIRouter(tags=["Inventario"])


@router.post("/inventarios", response_model=InventarioResponse, status_code=status.HTTP_201_CREATED)
def create_inventario(
    data: InventarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    return InventoryService(db).create(data, current_user.id)


@router.get("/inventarios/{inventario_id}", response_model=InventarioResponse)
def get_inventario(
    inventario_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return InventoryService(db).get(inventario_id)


@router.post("/inventarios/{inventario_id}/lecturas", response_model=InventarioResponse)
def registrar_lecturas(
    inventario_id: uuid.UUID,
    data: InventarioLecturasRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return InventoryService(db).registrar_lecturas(inventario_id, data)


@router.post("/inventarios/{inventario_id}/cerrar", response_model=InventarioResponse)
def cerrar_inventario(
    inventario_id: uuid.UUID,
    data: InventarioCerrarRequest | None = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return InventoryService(db).cerrar(inventario_id, data or InventarioCerrarRequest())
