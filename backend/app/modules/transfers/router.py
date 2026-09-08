import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.rbac import require_transfer_cancel, require_transfer_write
from app.dependencies import get_current_user
from app.modules.auth.models import Usuario
from app.modules.transfers.schemas import (
    TransferenciaConfirmarDestinoRequest,
    TransferenciaCreate,
    TransferenciaEpcsRequest,
    TransferenciaListItem,
    TransferenciaResponse,
)
from app.modules.transfers.service import TransferService

router = APIRouter(tags=["Transferencias"])


@router.post(
    "/transferencias",
    response_model=TransferenciaResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_transferencia(
    data: TransferenciaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_transfer_write),
):
    return TransferService(db).create(data, current_user)


@router.get("/transferencias", response_model=list[TransferenciaListItem])
def list_transferencias(
    estado: str | None = Query(
        None, description="pendiente | en_transito | completada | cancelada"
    ),
    deposito_origen_id: uuid.UUID | None = None,
    deposito_destino_id: uuid.UUID | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return TransferService(db).list_transferencias(
        estado=estado,
        deposito_origen_id=deposito_origen_id,
        deposito_destino_id=deposito_destino_id,
        limit=limit,
    )


@router.get("/transferencias/{transferencia_id}", response_model=TransferenciaResponse)
def get_transferencia(
    transferencia_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return TransferService(db).get(transferencia_id)


@router.post(
    "/transferencias/{transferencia_id}/confirmar-origen",
    response_model=TransferenciaResponse,
)
def confirmar_origen(
    transferencia_id: uuid.UUID,
    data: TransferenciaEpcsRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_transfer_write),
):
    return TransferService(db).confirmar_origen(transferencia_id, data)


@router.post(
    "/transferencias/{transferencia_id}/confirmar-destino",
    response_model=TransferenciaResponse,
)
def confirmar_destino(
    transferencia_id: uuid.UUID,
    data: TransferenciaConfirmarDestinoRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_transfer_write),
):
    return TransferService(db).confirmar_destino(transferencia_id, data, current_user)


@router.post(
    "/transferencias/{transferencia_id}/cancelar",
    response_model=TransferenciaResponse,
)
def cancelar_transferencia(
    transferencia_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_transfer_cancel),
):
    return TransferService(db).cancelar(transferencia_id)
