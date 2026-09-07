import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.assets.models import Activo
from app.modules.inventory.models import DetalleInventario, Inventario
from app.modules.inventory.schemas import (
    InventarioCerrarRequest,
    InventarioCreate,
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

DETALLE_ESPERADO = "esperado"
DETALLE_ENCONTRADO = "encontrado"
DETALLE_FALTANTE = "faltante"
DETALLE_SOBRANTE = "sobrante"


class InventoryService:
    def __init__(self, db: Session):
        self.db = db
        self.stock_service = StockService(db)

    def create(self, data: InventarioCreate, usuario_id: uuid.UUID | None) -> InventarioResponse:
        stock = self.stock_service.get_stock_deposito(
            data.deposito_id,
            sector_id=data.sector_id,
            ubicacion_id=data.ubicacion_id,
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
            resumen=response.resumen,
            coincidencia_pct=coincidencia,
            tiene_discrepancias=(
                response.resumen.total_faltante > 0 or response.resumen.total_sobrante > 0
            ),
            encontrados=encontrados,
            faltantes=faltantes,
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
    ) -> InventarioResponse:
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
        self.db.commit()
        return self.get(inventario_id)

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

            activo = self.db.scalars(select(Activo).where(Activo.epc == epc)).first()
            detalle = DetalleInventario(
                inventario_id=inventario.id,
                activo_id=activo.id if activo else None,
                epc=epc,
                numero_patrimonial=activo.numero_patrimonial if activo else None,
                descripcion=activo.descripcion if activo else "EPC no esperado en el alcance",
                estado=DETALLE_SOBRANTE,
                leido_en=now,
            )
            self.db.add(detalle)
            inventario.detalles.append(detalle)
            by_epc[epc] = detalle

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

    def _get_or_404(self, inventario_id: uuid.UUID) -> Inventario:
        inventario = self.db.scalars(
            select(Inventario)
            .where(Inventario.id == inventario_id)
            .options(selectinload(Inventario.detalles))
        ).first()
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
            iniciado_en=inventario.iniciado_en,
            cerrado_en=inventario.cerrado_en,
            resumen=InventarioResumen(
                total_esperado=inventario.total_esperado,
                total_encontrado=inventario.total_encontrado,
                total_faltante=inventario.total_faltante,
                total_sobrante=inventario.total_sobrante,
                sin_epc=sin_epc,
            ),
            detalles=[DetalleInventarioResponse.model_validate(d) for d in detalles],
        )
