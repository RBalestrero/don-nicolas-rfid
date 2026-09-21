import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.integrations.zebra.epc_generator import decode_epc, generar_epc
from app.integrations.zebra.printer_client import ZebraPrinterClient, ZebraPrinterError
from app.integrations.zebra.runtime import get_printer_config
from app.integrations.zebra.zpl_generator import EtiquetaData, generar_zpl_lote
from app.modules.assets.historial_service import HistorialService
from app.modules.assets.models import Etiqueta
from app.modules.assets.repository import ActivoRepository, EtiquetaRepository
from app.modules.assets.schemas import (
    EpcDecodedInfo,
    EtiquetaCodificacionResponse,
    EtiquetaImpresionResponse,
    EtiquetaLoteItem,
    EtiquetaLoteResponse,
    EtiquetaResponse,
)
from app.modules.auth.models import Usuario


def _to_epc_info(epc: str) -> EpcDecodedInfo:
    decoded = decode_epc(epc)
    return EpcDecodedInfo(
        epc=decoded.epc,
        scheme=decoded.scheme,
        articulo_code=decoded.articulo_code,
        articulo_sugerido=decoded.articulo_sugerido,
        serial=decoded.serial,
        serial_hex=decoded.serial_hex,
        system_suffix=decoded.system_suffix,
        del_sistema=decoded.del_sistema,
        valido=decoded.valido,
        mensaje=decoded.mensaje,
    )


def _etiqueta_to_response(etiqueta: Etiqueta) -> EtiquetaResponse:
    activo = etiqueta.activo
    return EtiquetaResponse(
        id=etiqueta.id,
        activo_id=etiqueta.activo_id,
        epc=etiqueta.epc,
        serial_hex=etiqueta.serial_hex,
        serie_fisica=etiqueta.serie_fisica,
        estado=etiqueta.estado,
        impresa=etiqueta.impresa,
        creado_en=etiqueta.creado_en,
        impresa_en=etiqueta.impresa_en,
        numero_patrimonial=activo.numero_patrimonial if activo else None,
        descripcion=activo.descripcion if activo else None,
        decodificado=_to_epc_info(etiqueta.epc),
    )


def _normalize_serie_fisica(raw: str) -> str:
    return (raw or "").strip().upper()


class ImpresionService:
    def __init__(self, db: Session):
        self.db = db
        self.activo_repository = ActivoRepository(db)
        self.etiqueta_repository = EtiquetaRepository(db)
        self.historial = HistorialService(db)
        self.printer = ZebraPrinterClient()

    def _get_activo_activo(self, activo_id: uuid.UUID):
        activo = self.activo_repository.get_by_id(activo_id)
        if not activo or not activo.activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Artículo no encontrado"
            )
        return activo

    def _generar_epc_unico(self, activo) -> tuple[str, EpcDecodedInfo]:
        for _ in range(16):
            epc = generar_epc(str(activo.id), activo.numero_patrimonial)
            if not self.etiqueta_repository.epc_exists(epc):
                return epc, _to_epc_info(epc)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se pudo generar un EPC único",
        )

    def list_etiquetas(
        self,
        *,
        activo_id: uuid.UUID | None = None,
        search: str | None = None,
    ) -> list[EtiquetaResponse]:
        rows = self.etiqueta_repository.list(activo_id=activo_id, search=search)
        return [_etiqueta_to_response(e) for e in rows]

    def crear_lote(
        self,
        activo_id: uuid.UUID,
        user: Usuario,
        cantidad: int,
        *,
        imprimir: bool,
        modo: str = "nueva",
        series_fisicas: list[str] | None = None,
    ) -> EtiquetaLoteResponse:
        """Crea N etiquetas nuevas o reimprime existentes (reposicion).

        - nueva: inserta N EPCs (aumenta stock). Si imprimir=True, envía a impresora.
        - reposicion: reimprime N etiquetas activas existentes sin crear EPCs ni
          aumentar stock. Solo válido con imprimir=True.
        """
        activo = self._get_activo_activo(activo_id)
        if cantidad < 1 or cantidad > 50:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cantidad debe estar entre 1 y 50",
            )
        if modo not in ("nueva", "reposicion"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="modo debe ser 'nueva' o 'reposicion'",
            )
        if modo == "reposicion" and not imprimir:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reposición solo aplica a impresión",
            )

        if modo == "reposicion":
            return self._reponer_lote(activo, user, cantidad)

        series = self._validar_series_fisicas(activo, cantidad, series_fisicas)

        nuevas: list[Etiqueta] = []
        items: list[EtiquetaLoteItem] = []
        zpl_datas: list[EtiquetaData] = []

        for i in range(cantidad):
            epc, decoded = self._generar_epc_unico(activo)
            serie = series[i] if series is not None else None
            etiqueta = Etiqueta(
                id=uuid.uuid4(),
                activo_id=activo.id,
                epc=epc,
                serial_hex=decoded.serial_hex,
                serie_fisica=serie,
                estado="activa",
                impresa=False,
                ubicacion_id=activo.ubicacion_id,
            )
            nuevas.append(etiqueta)
            items.append(
                EtiquetaLoteItem(
                    id=etiqueta.id,
                    epc=epc,
                    serial_hex=decoded.serial_hex,
                    serie_fisica=serie,
                    decodificado=decoded,
                )
            )
            zpl_datas.append(
                EtiquetaData(
                    numero_patrimonial=activo.numero_patrimonial,
                    descripcion=activo.descripcion,
                    epc=epc,
                    categoria=activo.categoria.nombre if activo.categoria else "",
                    serie_fisica=serie,
                )
            )

        modo_simulacion = get_printer_config().simulate
        enviado = False
        zpl: str | None = None

        try:
            self.etiqueta_repository.add_many(nuevas)

            if imprimir:
                zpl = generar_zpl_lote(zpl_datas)
                try:
                    enviado = self.printer.send(zpl)
                except ZebraPrinterError as exc:
                    self.db.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail=str(exc),
                    ) from exc

                now = datetime.now(timezone.utc)
                for etiqueta in nuevas:
                    etiqueta.impresa = True
                    etiqueta.impresa_en = now
                if not modo_simulacion:
                    zpl = None

            stock = self.etiqueta_repository.count_activas_by_activo(activo.id)
            self.historial.registrar(
                activo_id=activo.id,
                accion=(
                    HistorialService.ACCION_ETIQUETA_IMPRESA
                    if imprimir
                    else HistorialService.ACCION_ETIQUETA_CODIFICADA
                ),
                usuario=user,
                cambios={
                    "modo": "nueva",
                    "cantidad": cantidad,
                    "epcs": [i.epc for i in items],
                    "series_fisicas": [i.serie_fisica for i in items if i.serie_fisica],
                    "impreso": imprimir,
                    "modo_simulacion": modo_simulacion if imprimir else None,
                    "enviado_impresora": enviado if imprimir else False,
                    "stock_etiquetas": stock,
                },
                commit=False,
            )
            self.db.commit()
            for e in nuevas:
                self.db.refresh(e)
        except HTTPException:
            raise
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Conflicto al crear etiquetas (EPC o serie física duplicada). Reintentá.",
            ) from exc
        except Exception:
            self.db.rollback()
            raise

        stock = self.etiqueta_repository.count_activas_by_activo(activo.id)
        return EtiquetaLoteResponse(
            activo_id=activo.id,
            numero_patrimonial=activo.numero_patrimonial,
            descripcion=activo.descripcion,
            cantidad=cantidad,
            stock_etiquetas=stock,
            etiquetas=items,
            impreso=(enviado or modo_simulacion) if imprimir else False,
            modo_simulacion=modo_simulacion if imprimir else False,
            zpl=zpl if imprimir and modo_simulacion else None,
        )

    def _validar_series_fisicas(
        self,
        activo,
        cantidad: int,
        series_fisicas: list[str] | None,
    ) -> list[str] | None:
        """Valida y normaliza series de fábrica cuando el artículo está serializado."""
        raw = series_fisicas or []
        if not activo.serializado:
            if any((s or "").strip() for s in raw):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Este artículo no está serializado: no envíes series_fisicas",
                )
            return None

        if len(raw) != cantidad:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Artículo serializado: enviá exactamente {cantidad} "
                    "número(s) de serie de fábrica"
                ),
            )
        normalized: list[str] = []
        seen: set[str] = set()
        for i, value in enumerate(raw):
            serie = _normalize_serie_fisica(value)
            if not serie:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Serie física #{i + 1} vacía",
                )
            if len(serie) > 120:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Serie física #{i + 1} demasiado larga (máx. 120)",
                )
            if serie in seen:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Serie física duplicada en el lote: {serie}",
                )
            seen.add(serie)
            normalized.append(serie)

        existentes = {
            _normalize_serie_fisica(e.serie_fisica)
            for e in self.etiqueta_repository.list(activo_id=activo.id, solo_activas=False)
            if e.serie_fisica
        }
        for serie in normalized:
            if serie in existentes:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ya existe una etiqueta con serie física {serie}",
                )
        return normalized

    def _reponer_lote(
        self,
        activo,
        user: Usuario,
        cantidad: int,
    ) -> EtiquetaLoteResponse:
        stock = self.etiqueta_repository.count_activas_by_activo(activo.id)
        if stock == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No hay etiquetas para reponer",
            )
        if stock < cantidad:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stock insuficiente: hay {stock}, pediste {cantidad}",
            )

        existentes = self.etiqueta_repository.list(
            activo_id=activo.id, solo_activas=True, limit=cantidad
        )
        if len(existentes) < cantidad:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stock insuficiente: hay {len(existentes)}, pediste {cantidad}",
            )
        seleccion = existentes[:cantidad]

        items: list[EtiquetaLoteItem] = []
        zpl_datas: list[EtiquetaData] = []
        for etiqueta in seleccion:
            decoded = _to_epc_info(etiqueta.epc)
            items.append(
                EtiquetaLoteItem(
                    id=etiqueta.id,
                    epc=etiqueta.epc,
                    serial_hex=etiqueta.serial_hex,
                    serie_fisica=etiqueta.serie_fisica,
                    decodificado=decoded,
                )
            )
            zpl_datas.append(
                EtiquetaData(
                    numero_patrimonial=activo.numero_patrimonial,
                    descripcion=activo.descripcion,
                    epc=etiqueta.epc,
                    categoria=activo.categoria.nombre if activo.categoria else "",
                    serie_fisica=etiqueta.serie_fisica,
                )
            )

        modo_simulacion = get_printer_config().simulate
        enviado = False
        zpl: str | None = None

        try:
            zpl = generar_zpl_lote(zpl_datas)
            try:
                enviado = self.printer.send(zpl)
            except ZebraPrinterError as exc:
                self.db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=str(exc),
                ) from exc

            now = datetime.now(timezone.utc)
            for etiqueta in seleccion:
                etiqueta.impresa = True
                etiqueta.impresa_en = now
            if not modo_simulacion:
                zpl = None

            stock_final = self.etiqueta_repository.count_activas_by_activo(activo.id)
            self.historial.registrar(
                activo_id=activo.id,
                accion=HistorialService.ACCION_ETIQUETA_REPOSICION,
                usuario=user,
                cambios={
                    "modo": "reposicion",
                    "cantidad": cantidad,
                    "epcs": [i.epc for i in items],
                    "impreso": True,
                    "modo_simulacion": modo_simulacion,
                    "enviado_impresora": enviado,
                    "stock_etiquetas": stock_final,
                },
                commit=False,
            )
            self.db.commit()
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            raise

        stock_final = self.etiqueta_repository.count_activas_by_activo(activo.id)
        return EtiquetaLoteResponse(
            activo_id=activo.id,
            numero_patrimonial=activo.numero_patrimonial,
            descripcion=activo.descripcion,
            cantidad=cantidad,
            stock_etiquetas=stock_final,
            etiquetas=items,
            impreso=enviado or modo_simulacion,
            modo_simulacion=modo_simulacion,
            zpl=zpl if modo_simulacion else None,
        )

    def dar_baja_etiqueta(
        self,
        activo_id: uuid.UUID,
        etiqueta_id: uuid.UUID,
        user: Usuario,
    ) -> dict:
        """Soft-delete: marca la etiqueta como baja (deja de contar en stock)."""
        activo = self._get_activo_activo(activo_id)
        etiqueta = self.etiqueta_repository.get_by_id(etiqueta_id)
        if not etiqueta or etiqueta.activo_id != activo.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Etiqueta no encontrada",
            )
        if etiqueta.estado != "activa":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La etiqueta ya no está activa",
            )

        estado_anterior = etiqueta.estado
        etiqueta.estado = "baja"
        stock = self.etiqueta_repository.count_activas_by_activo(activo.id)
        self.historial.registrar(
            activo_id=activo.id,
            accion=HistorialService.ACCION_ETIQUETA_BAJA,
            usuario=user,
            cambios={
                "etiqueta_id": str(etiqueta.id),
                "epc": etiqueta.epc,
                "estado": {"anterior": estado_anterior, "nuevo": "baja"},
                "stock_etiquetas": stock,
            },
            commit=False,
        )
        self.db.commit()
        return {"stock_etiquetas": stock, "epc": etiqueta.epc}

    def codificar_etiqueta(
        self,
        activo_id: uuid.UUID,
        user: Usuario,
        regenerar: bool = False,
        cantidad: int = 1,
    ) -> EtiquetaCodificacionResponse:
        """Crea 1..N unidades RFID. `regenerar` es legacy: siempre crea unidades nuevas."""
        lote = self.crear_lote(activo_id, user, cantidad, imprimir=False)
        first = lote.etiquetas[0]
        # regenerar=True solo indica intención de "otra unidad"; no pisa EPCs existentes.
        return EtiquetaCodificacionResponse(
            activo_id=lote.activo_id,
            numero_patrimonial=lote.numero_patrimonial,
            descripcion=lote.descripcion,
            epc=first.epc,
            epc_asignado=True,
            regenerado=bool(regenerar),
            decodificado=first.decodificado,
            stock_etiquetas=lote.stock_etiquetas,
        )

    def imprimir_etiqueta(
        self,
        activo_id: uuid.UUID,
        user: Usuario,
        copias: int = 1,
    ) -> EtiquetaImpresionResponse:
        """Compat: imprime N etiquetas = N EPCs distintos (unidades nuevas)."""
        lote = self.crear_lote(activo_id, user, copias, imprimir=True)
        first = lote.etiquetas[0]
        return EtiquetaImpresionResponse(
            activo_id=lote.activo_id,
            numero_patrimonial=lote.numero_patrimonial,
            descripcion=lote.descripcion,
            epc=first.epc,
            epc_asignado=True,
            impreso=lote.impreso,
            modo_simulacion=lote.modo_simulacion,
            zpl=lote.zpl,
            decodificado=first.decodificado,
            stock_etiquetas=lote.stock_etiquetas,
            cantidad=lote.cantidad,
            etiquetas=lote.etiquetas,
        )
