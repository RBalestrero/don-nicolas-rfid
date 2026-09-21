import re
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.integrations.zebra.epc_generator import decode_epc
from app.modules.assets.historial_service import HistorialService
from app.modules.assets.models import Activo, Etiqueta, HistorialActivo
from app.modules.auth.models import Usuario
from app.modules.inventory.models import DetalleInventario, Inventario
from app.modules.inventory.schemas import (
    InventarioAuditarRequest,
    InventarioCerrarRequest,
    InventarioCreate,
    InventarioDescartarRequest,
    InventarioLecturasRequest,
    InventarioListItem,
    InventarioReporteResponse,
    InventarioResponse,
    InventarioResumen,
    DetalleInventarioResponse,
)
from app.modules.warehouses.stock_service import StockService


ESTADO_EN_CURSO = "en_curso"
ESTADO_CERRADO = "cerrado"
ESTADO_CANCELADO = "cancelado"
ESTADO_DESCARTADO = "descartado"

DETALLE_ESPERADO = "esperado"
DETALLE_ENCONTRADO = "encontrado"
DETALLE_FALTANTE = "faltante"
DETALLE_SOBRANTE = "sobrante"

ETIQUETA_ACTIVA = "activa"
ETIQUETA_PERDIDA = "perdida"


def _keys_articulo(detalle: DetalleInventario) -> set[str]:
    """Claves para emparejar unidades del mismo artículo (SKU)."""
    keys: set[str] = set()
    pat = (detalle.numero_patrimonial or "").strip().upper()
    if pat:
        keys.add(f"P:{pat}")
        digits = re.sub(r"\D", "", pat)
        if digits:
            keys.add(f"C:{int(digits)}")
    if detalle.activo_id is not None:
        keys.add(f"A:{detalle.activo_id}")
    epc = (detalle.epc or "").strip().upper()
    if epc:
        decoded = decode_epc(epc)
        if decoded.articulo_code is not None:
            keys.add(f"C:{decoded.articulo_code}")
            if decoded.articulo_sugerido:
                keys.add(f"P:{decoded.articulo_sugerido.strip().upper()}")
    return keys


def clasificar_sobrantes(
    detalles: list[DetalleInventario],
) -> tuple[list[DetalleInventario], list[DetalleInventario]]:
    """Separa sobrantes en excesos (artículo del depósito) vs ajenos."""
    expected_keys: set[str] = set()
    for detalle in detalles:
        if detalle.estado == DETALLE_SOBRANTE:
            continue
        expected_keys |= _keys_articulo(detalle)

    excesos: list[DetalleInventario] = []
    ajenos: list[DetalleInventario] = []
    for detalle in detalles:
        if detalle.estado != DETALLE_SOBRANTE:
            continue
        keys = _keys_articulo(detalle)
        if keys and (keys & expected_keys):
            excesos.append(detalle)
        else:
            ajenos.append(detalle)
    return excesos, ajenos


class InventoryService:
    def __init__(self, db: Session):
        self.db = db
        self.stock_service = StockService(db)
        self.historial = HistorialService(db)

    def create(self, data: InventarioCreate, usuario_id: uuid.UUID | None) -> InventarioResponse:
        if data.activo_id is not None:
            activo = self.db.get(Activo, data.activo_id)
            if activo is None or not activo.activo:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Artículo no encontrado o inactivo",
                )

        stock = self.stock_service.get_stock_deposito(
            data.deposito_id,
            sector_id=data.sector_id,
            ubicacion_id=data.ubicacion_id,
            activo_id=data.activo_id,
        )
        if data.activo_id is not None and stock.total < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El artículo no tiene unidades en ese depósito",
            )

        inventario = Inventario(
            deposito_id=data.deposito_id,
            sector_id=data.sector_id,
            ubicacion_id=data.ubicacion_id,
            usuario_id=usuario_id,
            estado=ESTADO_EN_CURSO,
            total_esperado=stock.total,
            total_encontrado=0,
            total_faltante=0,
            total_sobrante=0,
            total_exceso=0,
        )
        self.db.add(inventario)
        self.db.flush()

        for item in stock.activos:
            self.db.add(
                DetalleInventario(
                    inventario_id=inventario.id,
                    activo_id=item.activo_id,
                    epc=item.epc,
                    numero_patrimonial=item.numero_patrimonial,
                    descripcion=item.descripcion,
                    estado=DETALLE_ESPERADO,
                )
            )

        self.db.commit()
        return self.get(inventario.id)

    def get(self, inventario_id: uuid.UUID) -> InventarioResponse:
        inventario = self._get_or_404(inventario_id)
        return self._to_response(inventario)

    def list_inventarios(
        self,
        *,
        deposito_id: uuid.UUID | None = None,
        estado: str | None = None,
        limit: int = 50,
    ) -> list[InventarioListItem]:
        stmt = select(Inventario).order_by(Inventario.iniciado_en.desc()).limit(min(limit, 200))
        if deposito_id is not None:
            stmt = stmt.where(Inventario.deposito_id == deposito_id)
        if estado is not None:
            stmt = stmt.where(Inventario.estado == estado)
        rows = list(self.db.scalars(stmt).all())
        return [InventarioListItem.model_validate(row) for row in rows]

    def reporte(self, inventario_id: uuid.UUID) -> InventarioReporteResponse:
        inventario = self._get_or_404(inventario_id)
        response = self._to_response(inventario)
        encontrados = [d for d in response.detalles if d.estado == DETALLE_ENCONTRADO]
        faltantes = [d for d in response.detalles if d.estado == DETALLE_FALTANTE]
        sobrantes = [d for d in response.detalles if d.estado == DETALLE_SOBRANTE]
        excesos_orm, ajenos_orm = clasificar_sobrantes(list(inventario.detalles))
        exceso_ids = {d.id for d in excesos_orm}
        ajeno_ids = {d.id for d in ajenos_orm}
        excesos = [d for d in sobrantes if d.id in exceso_ids]
        ajenos = [d for d in sobrantes if d.id in ajeno_ids]
        sin_epc = [
            d
            for d in response.detalles
            if d.estado in (DETALLE_ESPERADO, DETALLE_FALTANTE, DETALLE_ENCONTRADO) and not d.epc
        ]
        esperado = response.resumen.total_esperado
        coincidencia = (
            round(100.0 * response.resumen.total_encontrado / esperado, 1) if esperado > 0 else 0.0
        )
        return InventarioReporteResponse(
            inventario_id=inventario.id,
            deposito_id=inventario.deposito_id,
            estado=inventario.estado,
            iniciado_en=inventario.iniciado_en,
            cerrado_en=inventario.cerrado_en,
            auditado=inventario.auditado,
            auditado_en=inventario.auditado_en,
            auditado_por_id=inventario.auditado_por_id,
            comentario_auditoria=inventario.comentario_auditoria,
            ajuste_aplicado=inventario.ajuste_aplicado,
            resumen=response.resumen,
            coincidencia_pct=coincidencia,
            tiene_discrepancias=(
                response.resumen.total_faltante > 0 or response.resumen.total_exceso > 0
            ),
            encontrados=encontrados,
            faltantes=faltantes,
            excesos=excesos,
            ajenos=ajenos,
            sobrantes=sobrantes,
            sin_epc=sin_epc,
        )

    def registrar_lecturas(
        self,
        inventario_id: uuid.UUID,
        data: InventarioLecturasRequest,
    ) -> InventarioResponse:
        inventario = self._get_or_404(inventario_id)
        if inventario.estado != ESTADO_EN_CURSO:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El inventario ya no está en curso",
            )
        self._aplicar_lecturas(inventario, data.epcs)
        self._recalcular_contadores(inventario, cerrado=False)
        self.db.commit()
        return self.get(inventario_id)

    def cerrar(
        self,
        inventario_id: uuid.UUID,
        data: InventarioCerrarRequest | None = None,
        usuario: Usuario | None = None,
    ) -> InventarioResponse:
        """Cierra el conteo y clasifica faltantes. El stock se ajusta al confirmar auditoría."""
        del usuario  # Historial de ajuste se registra en auditar, no al cerrar.
        inventario = self._get_or_404(inventario_id)
        if inventario.estado != ESTADO_EN_CURSO:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El inventario ya está cerrado",
            )
        if data and data.epcs:
            self._aplicar_lecturas(inventario, data.epcs)

        now = datetime.now(UTC)
        for detalle in inventario.detalles:
            if detalle.estado == DETALLE_ESPERADO:
                detalle.estado = DETALLE_FALTANTE

        inventario.estado = ESTADO_CERRADO
        inventario.cerrado_en = now
        self._recalcular_contadores(inventario, cerrado=True)
        # Faltantes quedan pendientes de auditoría: no se toca stock ni etiquetas acá.
        # Sobrantes: solo se reportan; no se incorporan al depósito.
        self.db.commit()
        return self.get(inventario_id)

    def cancelar(self, inventario_id: uuid.UUID) -> InventarioResponse:
        """Cancela un inventario en curso (MC33; no genera faltantes ni toca stock)."""
        inventario = self._get_or_404(inventario_id)
        if inventario.estado != ESTADO_EN_CURSO:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Solo se pueden cancelar inventarios en curso",
            )
        inventario.estado = ESTADO_CANCELADO
        inventario.cerrado_en = datetime.now(UTC)
        self.db.commit()
        return self.get(inventario_id)

    def resetear_lecturas(self, inventario_id: uuid.UUID) -> InventarioResponse:
        """Vuelve el conteo a cero sin cancelar el inventario (MC33, reintento)."""
        inventario = self._get_or_404(inventario_id)
        if inventario.estado != ESTADO_EN_CURSO:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Solo se pueden borrar lecturas de inventarios en curso",
            )

        sobrantes = [d for d in list(inventario.detalles) if d.estado == DETALLE_SOBRANTE]
        for detalle in inventario.detalles:
            if detalle.estado in (DETALLE_ENCONTRADO, DETALLE_FALTANTE):
                detalle.estado = DETALLE_ESPERADO
                detalle.leido_en = None
        for detalle in sobrantes:
            inventario.detalles.remove(detalle)
            self.db.delete(detalle)

        self._recalcular_contadores(inventario, cerrado=False)
        self.db.commit()
        return self.get(inventario_id)

    def auditar(
        self,
        inventario_id: uuid.UUID,
        data: InventarioAuditarRequest,
        usuario: Usuario,
    ) -> InventarioResponse:
        """Confirma auditoría: aplica ajuste de stock por faltantes una sola vez."""
        inventario = self._get_or_404(inventario_id, for_update=True)
        if inventario.estado != ESTADO_CERRADO:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Solo se pueden auditar inventarios cerrados",
            )

        if data.auditado:
            ya_ajustado = self._stock_fue_ajustado(inventario)
            necesita_ajuste = (
                inventario.total_faltante > 0 or inventario.total_exceso > 0
            )
            if not ya_ajustado and necesita_ajuste:
                self._aplicar_ajuste_stock(inventario, usuario=usuario)
                inventario.ajuste_aplicado = True
            elif ya_ajustado:
                inventario.ajuste_aplicado = True
            else:
                # Sin diferencias: marcar como resuelto sin tocar stock.
                inventario.ajuste_aplicado = True
            inventario.auditado = True
            inventario.auditado_en = datetime.now(UTC)
            inventario.auditado_por_id = usuario.id
            if data.comentario is not None or not inventario.comentario_auditoria:
                inventario.comentario_auditoria = data.comentario
        else:
            if self._stock_fue_ajustado(inventario):
                inventario.ajuste_aplicado = True
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="No se puede revertir la auditoría: el ajuste de stock ya se aplicó",
                )
            inventario.ajuste_aplicado = False
            inventario.auditado = False
            inventario.auditado_en = None
            inventario.auditado_por_id = None
            inventario.comentario_auditoria = data.comentario

        self.db.commit()
        return self.get(inventario_id)

    def descartar(
        self,
        inventario_id: uuid.UUID,
        data: InventarioDescartarRequest,
        usuario: Usuario,
    ) -> InventarioResponse:
        """Rechaza un inventario cerrado inválido sin aplicar ajuste de stock."""
        inventario = self._get_or_404(inventario_id, for_update=True)
        if inventario.estado != ESTADO_CERRADO:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Solo se pueden descartar inventarios cerrados",
            )
        if inventario.auditado:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No se puede descartar un inventario ya auditado",
            )
        if self._stock_fue_ajustado(inventario):
            inventario.ajuste_aplicado = True
            self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No se puede descartar: el ajuste de stock ya se aplicó",
            )

        inventario.estado = ESTADO_DESCARTADO
        inventario.auditado = True
        inventario.auditado_en = datetime.now(UTC)
        inventario.auditado_por_id = usuario.id
        inventario.comentario_auditoria = data.comentario
        inventario.ajuste_aplicado = False
        self.db.commit()
        return self.get(inventario_id)

    def _stock_fue_ajustado(self, inventario: Inventario) -> bool:
        """True si ya hay historial de ajuste de stock para este inventario."""
        inv_id = str(inventario.id)
        row = self.db.scalars(
            select(HistorialActivo.id)
            .where(
                HistorialActivo.accion == HistorialService.ACCION_AJUSTE_INVENTARIO,
                HistorialActivo.cambios["inventario_id"].as_string() == inv_id,
            )
            .limit(1)
        ).first()
        return row is not None

    def _aplicar_lecturas(self, inventario: Inventario, epcs: list[str]) -> None:
        normalized = []
        seen: set[str] = set()
        for raw in epcs:
            epc = (raw or "").strip().upper()
            if not epc or epc in seen:
                continue
            seen.add(epc)
            normalized.append(epc)

        if not normalized:
            return

        by_epc: dict[str, DetalleInventario] = {}
        for detalle in inventario.detalles:
            if detalle.epc:
                by_epc[detalle.epc.upper()] = detalle

        scoped_activo_ids = self._scoped_activo_ids(inventario)
        now = datetime.now(UTC)
        for epc in normalized:
            existing = by_epc.get(epc)
            if existing is not None:
                if existing.estado in (DETALLE_ESPERADO, DETALLE_FALTANTE):
                    existing.estado = DETALLE_ENCONTRADO
                    existing.leido_en = now
                elif existing.estado == DETALLE_SOBRANTE and existing.leido_en is None:
                    existing.leido_en = now
                continue

            # Depósito multi-SKU: fuera del snapshot se ignora.
            # Inventario de un solo artículo: mismo SKU registrado → sobrante/exceso.
            if not scoped_activo_ids:
                continue
            etiqueta = self.db.scalars(
                select(Etiqueta).where(Etiqueta.epc == epc)
            ).first()
            activo: Activo | None = None
            if etiqueta is not None:
                activo = self.db.get(Activo, etiqueta.activo_id)
            else:
                activo = self.db.scalars(select(Activo).where(Activo.epc == epc)).first()
            if activo is None or activo.id not in scoped_activo_ids:
                continue

            nuevo = DetalleInventario(
                inventario_id=inventario.id,
                activo_id=activo.id,
                epc=epc,
                numero_patrimonial=activo.numero_patrimonial,
                descripcion=activo.descripcion,
                estado=DETALLE_SOBRANTE,
                leido_en=now,
            )
            self.db.add(nuevo)
            inventario.detalles.append(nuevo)
            by_epc[epc] = nuevo

    def _scoped_activo_ids(self, inventario: Inventario) -> set[uuid.UUID] | None:
        """Si el snapshot es de un único artículo, permite excesos de ese SKU."""
        ids = {
            d.activo_id
            for d in inventario.detalles
            if d.activo_id is not None and d.estado != DETALLE_SOBRANTE
        }
        if len(ids) == 1:
            return ids
        return None

    def _aplicar_ajuste_stock(
        self,
        inventario: Inventario,
        *,
        usuario: Usuario | None,
    ) -> None:
        """Alinea stock: faltantes → perdida; excesos del mismo SKU → ubica en el inventario."""
        for detalle in list(inventario.detalles):
            if detalle.estado == DETALLE_FALTANTE:
                self._ajustar_faltante(inventario, detalle, usuario=usuario)
        excesos, _ajenos = clasificar_sobrantes(list(inventario.detalles))
        for detalle in excesos:
            self._ajustar_exceso(inventario, detalle, usuario=usuario)

    def _ajustar_exceso(
        self,
        inventario: Inventario,
        detalle: DetalleInventario,
        *,
        usuario: Usuario | None,
    ) -> None:
        """Mueve la etiqueta sobrante a la ubicación del inventario (si está definida)."""
        if inventario.ubicacion_id is None:
            return
        activo, etiqueta = self._resolver_activo_etiqueta(detalle)
        if activo is None:
            return

        cambios: dict = {
            "tipo": "exceso",
            "inventario_id": str(inventario.id),
            "epc": detalle.epc,
            "deposito_id": str(inventario.deposito_id),
            "ubicacion_id": {
                "nuevo": str(inventario.ubicacion_id),
            },
        }

        if etiqueta is not None:
            anterior = str(etiqueta.ubicacion_id) if etiqueta.ubicacion_id else None
            cambios["ubicacion_id"]["anterior"] = anterior
            if etiqueta.estado == ETIQUETA_PERDIDA:
                etiqueta.estado = ETIQUETA_ACTIVA
                cambios["etiqueta_estado"] = {
                    "anterior": ETIQUETA_PERDIDA,
                    "nuevo": ETIQUETA_ACTIVA,
                }
            etiqueta.ubicacion_id = inventario.ubicacion_id
            if etiqueta.persona_custodio_id is not None:
                cambios["persona_custodio_id"] = {
                    "anterior": str(etiqueta.persona_custodio_id),
                    "nuevo": None,
                }
                etiqueta.persona_custodio_id = None
        else:
            anterior = str(activo.ubicacion_id) if activo.ubicacion_id else None
            cambios["ubicacion_id"]["anterior"] = anterior
            activo.ubicacion_id = inventario.ubicacion_id

        if activo.persona_custodio_id is not None and etiqueta is None:
            cambios["persona_custodio_id"] = {
                "anterior": str(activo.persona_custodio_id),
                "nuevo": None,
            }
            activo.persona_custodio_id = None

        self.historial.registrar(
            activo_id=activo.id,
            accion=HistorialService.ACCION_AJUSTE_INVENTARIO,
            usuario=usuario,
            cambios=cambios,
            commit=False,
        )

    def _ajustar_faltante(
        self,
        inventario: Inventario,
        detalle: DetalleInventario,
        *,
        usuario: Usuario | None,
    ) -> None:
        activo, etiqueta = self._resolver_activo_etiqueta(detalle)
        if activo is None:
            return

        cambios: dict = {
            "tipo": "faltante",
            "inventario_id": str(inventario.id),
            "epc": detalle.epc,
            "deposito_id": str(inventario.deposito_id),
        }
        ubicacion_anterior = str(activo.ubicacion_id) if activo.ubicacion_id else None

        if etiqueta is not None and etiqueta.estado == ETIQUETA_ACTIVA:
            etiqueta.estado = ETIQUETA_PERDIDA
            cambios["etiqueta_estado"] = {
                "anterior": ETIQUETA_ACTIVA,
                "nuevo": ETIQUETA_PERDIDA,
            }

        self.db.flush()
        activas = [
            e
            for e in self.db.scalars(
                select(Etiqueta).where(
                    Etiqueta.activo_id == activo.id,
                    Etiqueta.estado == ETIQUETA_ACTIVA,
                )
            ).all()
            if e.estado == ETIQUETA_ACTIVA
        ]
        # Sin unidades activas (o legacy sin etiquetas): sale del stock de la ubicación
        if not activas and activo.ubicacion_id is not None:
            cambios["ubicacion_id"] = {"anterior": ubicacion_anterior, "nuevo": None}
            activo.ubicacion_id = None

        # Legacy: si el EPC faltante estaba solo en activos.epc, limpiar columna
        legacy = (activo.epc or "").strip().upper()
        detalle_epc = (detalle.epc or "").strip().upper()
        if legacy and detalle_epc and legacy == detalle_epc:
            activo.epc = None
            cambios["epc_legacy"] = {"anterior": legacy, "nuevo": None}
            if activo.ubicacion_id is not None and not activas:
                cambios["ubicacion_id"] = {"anterior": ubicacion_anterior, "nuevo": None}
                activo.ubicacion_id = None

        self.historial.registrar(
            activo_id=activo.id,
            accion=HistorialService.ACCION_AJUSTE_INVENTARIO,
            usuario=usuario,
            cambios=cambios,
            commit=False,
        )

    def _resolver_activo_etiqueta(
        self, detalle: DetalleInventario
    ) -> tuple[Activo | None, Etiqueta | None]:
        epc = (detalle.epc or "").strip().upper()
        etiqueta: Etiqueta | None = None
        if epc:
            etiqueta = self.db.scalars(select(Etiqueta).where(Etiqueta.epc == epc)).first()

        activo: Activo | None = None
        if etiqueta is not None:
            activo = self.db.get(Activo, etiqueta.activo_id)
        elif detalle.activo_id is not None:
            activo = self.db.get(Activo, detalle.activo_id)
        elif epc:
            activo = self.db.scalars(select(Activo).where(Activo.epc == epc)).first()
        return activo, etiqueta

    def _recalcular_contadores(self, inventario: Inventario, *, cerrado: bool) -> None:
        esperado = 0
        encontrado = 0
        faltante = 0
        sobrante = 0
        pendientes = 0
        for detalle in inventario.detalles:
            if detalle.estado == DETALLE_ENCONTRADO:
                encontrado += 1
                esperado += 1
            elif detalle.estado == DETALLE_FALTANTE:
                faltante += 1
                esperado += 1
            elif detalle.estado == DETALLE_ESPERADO:
                esperado += 1
                pendientes += 1
            elif detalle.estado == DETALLE_SOBRANTE:
                sobrante += 1

        inventario.total_esperado = esperado
        inventario.total_encontrado = encontrado
        inventario.total_faltante = faltante if cerrado else pendientes
        inventario.total_sobrante = sobrante
        excesos, _ajenos = clasificar_sobrantes(list(inventario.detalles))
        inventario.total_exceso = len(excesos)

    def _get_or_404(
        self, inventario_id: uuid.UUID, *, for_update: bool = False
    ) -> Inventario:
        stmt = (
            select(Inventario)
            .where(Inventario.id == inventario_id)
            .options(selectinload(Inventario.detalles))
        )
        if for_update:
            # Solo bloquear inventarios (evita deadlock con FK a usuarios/activos).
            stmt = stmt.with_for_update(of=Inventario)
        inventario = self.db.scalars(stmt).first()
        if not inventario:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Inventario no encontrado",
            )
        return inventario

    def _to_response(self, inventario: Inventario) -> InventarioResponse:
        sin_epc = sum(
            1
            for d in inventario.detalles
            if d.estado in (DETALLE_ESPERADO, DETALLE_FALTANTE, DETALLE_ENCONTRADO) and not d.epc
        )
        detalles = sorted(
            inventario.detalles,
            key=lambda d: (
                0 if d.estado == DETALLE_FALTANTE else 1 if d.estado == DETALLE_SOBRANTE else 2,
                d.numero_patrimonial or d.epc or "",
            ),
        )
        return InventarioResponse(
            id=inventario.id,
            deposito_id=inventario.deposito_id,
            sector_id=inventario.sector_id,
            ubicacion_id=inventario.ubicacion_id,
            usuario_id=inventario.usuario_id,
            estado=inventario.estado,
            total_esperado=inventario.total_esperado,
            total_encontrado=inventario.total_encontrado,
            total_faltante=inventario.total_faltante,
            total_sobrante=inventario.total_sobrante,
            total_exceso=inventario.total_exceso,
            iniciado_en=inventario.iniciado_en,
            cerrado_en=inventario.cerrado_en,
            auditado=inventario.auditado,
            auditado_en=inventario.auditado_en,
            auditado_por_id=inventario.auditado_por_id,
            comentario_auditoria=inventario.comentario_auditoria,
            ajuste_aplicado=inventario.ajuste_aplicado,
            resumen=InventarioResumen(
                total_esperado=inventario.total_esperado,
                total_encontrado=inventario.total_encontrado,
                total_faltante=inventario.total_faltante,
                total_sobrante=inventario.total_sobrante,
                total_exceso=inventario.total_exceso,
                sin_epc=sin_epc,
            ),
            detalles=[DetalleInventarioResponse.model_validate(d) for d in detalles],
        )
