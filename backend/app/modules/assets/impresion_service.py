import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.integrations.zebra.epc_generator import generar_epc
from app.integrations.zebra.printer_client import ZebraPrinterClient, ZebraPrinterError
from app.integrations.zebra.zpl_generator import EtiquetaData, generar_zpl_etiqueta
from app.modules.assets.historial_service import HistorialService
from app.modules.assets.repository import ActivoRepository
from app.modules.assets.schemas import EtiquetaImpresionResponse
from app.modules.auth.models import Usuario


class ImpresionService:
    def __init__(self, db: Session):
        self.db = db
        self.activo_repository = ActivoRepository(db)
        self.historial = HistorialService(db)
        self.printer = ZebraPrinterClient()

    def imprimir_etiqueta(
        self,
        activo_id: uuid.UUID,
        user: Usuario,
        copias: int = 1,
    ) -> EtiquetaImpresionResponse:
        activo = self.activo_repository.get_by_id(activo_id)
        if not activo or not activo.activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Activo no encontrado"
            )

        epc_nuevo = False
        epc = activo.epc
        if not epc:
            epc = generar_epc(activo.id)
            if self.activo_repository.get_by_epc(epc):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="No se pudo generar un EPC único",
                )
            activo.epc = epc
            self.activo_repository.update(activo)
            epc_nuevo = True

        etiqueta = EtiquetaData(
            numero_patrimonial=activo.numero_patrimonial,
            descripcion=activo.descripcion,
            epc=epc,
            categoria=activo.categoria.nombre if activo.categoria else "",
        )
        zpl = generar_zpl_etiqueta(etiqueta, copias=copias)

        try:
            enviado = self.printer.send(zpl)
        except ZebraPrinterError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(exc),
            ) from exc

        settings = get_settings()
        modo_simulacion = settings.zebra_printer_simulate

        self.historial.registrar(
            activo_id=activo.id,
            accion=HistorialService.ACCION_ETIQUETA_IMPRESA,
            usuario=user,
            cambios={
                "epc": epc,
                "epc_nuevo": epc_nuevo,
                "copias": copias,
                "modo_simulacion": modo_simulacion,
                "enviado_impresora": enviado,
            },
        )

        return EtiquetaImpresionResponse(
            activo_id=activo.id,
            numero_patrimonial=activo.numero_patrimonial,
            descripcion=activo.descripcion,
            epc=epc,
            epc_asignado=epc_nuevo,
            impreso=enviado or modo_simulacion,
            modo_simulacion=modo_simulacion,
            zpl=zpl if modo_simulacion else None,
        )
