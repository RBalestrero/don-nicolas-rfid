from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.rbac import require_mc33_client
from app.database import get_db
from app.modules.auth.models import Usuario
from app.modules.devices.schemas import (
    DispositivoHeartbeatRequest,
    DispositivoLogoutRequest,
    DispositivoMovilItem,
    DispositivoRegistroRequest,
)
from app.modules.devices.service import DevicesService

router = APIRouter(prefix="/dispositivos", tags=["Dispositivos"])


@router.post("/registro", response_model=DispositivoMovilItem)
def registrar_dispositivo(
    data: DispositivoRegistroRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mc33_client),
):
    return DevicesService(db).registrar(data, current_user)


@router.post("/heartbeat", response_model=DispositivoMovilItem)
def heartbeat_dispositivo(
    data: DispositivoHeartbeatRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mc33_client),
):
    return DevicesService(db).heartbeat(data, current_user)


@router.post("/logout", response_model=DispositivoMovilItem | None)
def logout_dispositivo(
    data: DispositivoLogoutRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mc33_client),
):
    return DevicesService(db).logout(data, current_user)
