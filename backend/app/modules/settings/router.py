from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.rbac import require_printer_manage, require_printer_read
from app.database import get_db
from app.integrations.zebra.printer_client import ZebraPrinterClient
from app.modules.auth.models import Usuario
from app.modules.settings.schemas import (
    ImpresoraConfigResponse,
    ImpresoraConfigUpdate,
    ImpresoraEstadoResponse,
)
from app.modules.settings.service import load_printer_config, save_printer_config

router = APIRouter(prefix="/config", tags=["Configuración"])


def _to_response(cfg) -> ImpresoraConfigResponse:
    return ImpresoraConfigResponse(
        host=cfg.host,
        port=cfg.port,
        simulate=cfg.simulate,
        timeout=cfg.timeout,
        actualizado_en=cfg.actualizado_en.isoformat() if cfg.actualizado_en else None,
        fuente=cfg.fuente,
    )


@router.get("/impresora", response_model=ImpresoraConfigResponse)
def get_impresora_config(
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_printer_read),
):
    return _to_response(load_printer_config(db))


@router.get("/impresora/estado", response_model=ImpresoraEstadoResponse)
def get_impresora_estado(
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_printer_read),
):
    """Consulta estado de la impresora vía ~HQES (ZPL sobre TCP 9100)."""
    cfg = load_printer_config(db)
    status, mensaje, detalle = ZebraPrinterClient().probe_status(
        host=cfg.host,
        port=cfg.port,
        timeout=cfg.timeout,
        simulate=cfg.simulate,
    )
    return ImpresoraEstadoResponse(
        status=status.value,
        mensaje=mensaje,
        host=cfg.host,
        port=cfg.port,
        simulate=cfg.simulate,
        detalle=detalle,
    )


@router.put("/impresora", response_model=ImpresoraConfigResponse)
def update_impresora_config(
    data: ImpresoraConfigUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_printer_manage),
):
    cfg = save_printer_config(
        db,
        host=data.host,
        port=data.port,
        simulate=data.simulate,
        timeout=data.timeout,
    )
    return _to_response(cfg)
