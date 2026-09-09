import uuid
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.modules.assets.historial_service import HistorialService
from app.modules.assets.models import Activo, HistorialActivo
from app.modules.inventory.models import Inventario
from app.modules.reports.schemas import (
    DashboardKpis,
    DashboardResumen,
    DiscrepanciasKpi,
    InventarioResumenItem,
    MovimientoItem,
    MovimientosPage,
    StockDepositoResumen,
    TransferenciaResumen,
)
from app.modules.transfers.models import Transferencia
from app.modules.warehouses.models import Deposito, Sector, Ubicacion


class ReportsService:
    def __init__(self, db: Session):
        self.db = db
        self.historial = HistorialService(db)

    def list_movimientos(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        accion: str | None = None,
        activo_id: uuid.UUID | None = None,
        usuario_id: uuid.UUID | None = None,
        desde: datetime | None = None,
        hasta: datetime | None = None,
        search: str | None = None,
    ) -> MovimientosPage:
        registros, total = self.historial.list_global(
            limit=limit,
            offset=offset,
            accion=accion,
            activo_id=activo_id,
            usuario_id=usuario_id,
            desde=desde,
            hasta=hasta,
            search=search,
        )
        return MovimientosPage(
            total=total,
            limit=min(max(limit, 1), 10_000),
            offset=max(offset, 0),
            items=[self._to_movimiento(r) for r in registros],
        )

    def dashboard_resumen(
        self,
        *,
        movimientos_limit: int = 20,
        ops_limit: int = 10,
    ) -> DashboardResumen:
        movimientos_limit = min(max(movimientos_limit, 1), 50)
        ops_limit = min(max(ops_limit, 1), 50)

        activos_activos = self._count(select(func.count()).select_from(Activo).where(Activo.activo.is_(True)))
        depositos_activos = self._count(
            select(func.count()).select_from(Deposito).where(Deposito.activo.is_(True))
        )
        inventarios_abiertos = self._count(
            select(func.count()).select_from(Inventario).where(Inventario.estado == "en_curso")
        )
        transferencias_abiertas = self._count(
            select(func.count())
            .select_from(Transferencia)
            .where(Transferencia.estado.in_(["pendiente", "en_transito"]))
        )
        stock_total_ubicado = self._count(
            select(func.count())
            .select_from(Activo)
            .where(Activo.activo.is_(True), Activo.ubicacion_id.is_not(None))
        )

        disc_rows = self.db.execute(
            select(
                func.coalesce(func.sum(Inventario.total_faltante), 0),
                func.coalesce(func.sum(Inventario.total_sobrante), 0),
                func.count(),
            ).where(
                Inventario.estado == "cerrado",
                or_(Inventario.total_faltante > 0, Inventario.total_sobrante > 0),
            )
        ).one()
        discrepancias = DiscrepanciasKpi(
            faltantes=int(disc_rows[0] or 0),
            sobrantes=int(disc_rows[1] or 0),
            inventarios_con_discrepancia=int(disc_rows[2] or 0),
        )

        activos_sin_ubicacion = max(0, activos_activos - stock_total_ubicado)
        cobertura_ubicacion_pct = (
            round((stock_total_ubicado / activos_activos) * 100) if activos_activos > 0 else 0
        )

        inventario_rows = list(
            self.db.scalars(
                select(Inventario).where(Inventario.estado.in_(["en_curso", "cerrado"]))
            ).all()
        )
        inventarios_pendientes_auditoria = sum(
            1 for inv in inventario_rows if inv.estado == "cerrado" and not inv.auditado
        )
        inventarios_con_discrepancia_pendiente = sum(
            1
            for inv in inventario_rows
            if inv.estado == "cerrado"
            and not inv.auditado
            and (inv.total_faltante > 0 or inv.total_sobrante > 0)
        )
        inventarios_activos_pendientes = sum(
            max(0, (inv.total_esperado or 0) - (inv.total_encontrado or 0))
            for inv in inventario_rows
            if inv.estado == "en_curso"
        )
        inventarios_esperados_abiertos = sum(
            max(0, inv.total_esperado or 0) for inv in inventario_rows if inv.estado == "en_curso"
        )
        inventarios_encontrados_abiertos = sum(
            max(0, inv.total_encontrado or 0) for inv in inventario_rows if inv.estado == "en_curso"
        )
        inventarios_avance_pct = (
            round((inventarios_encontrados_abiertos / inventarios_esperados_abiertos) * 100)
            if inventarios_esperados_abiertos > 0
            else 0
        )

        transferencias_rows = list(
            self.db.scalars(
                select(Transferencia)
                .options(selectinload(Transferencia.detalles))
                .where(Transferencia.estado.in_(["pendiente", "en_transito"]))
            ).all()
        )
        transferencias_en_transito = sum(1 for t in transferencias_rows if t.estado == "en_transito")
        transferencias_detalles_abiertas = sum(len(t.detalles) for t in transferencias_rows)
        transferencias_confirmadas_destino = sum(
            sum(1 for d in t.detalles if d.confirmado_destino) for t in transferencias_rows
        )
        transferencias_activos_pendientes = max(
            0, transferencias_detalles_abiertas - transferencias_confirmadas_destino
        )
        transferencias_avance_pct = (
            round((transferencias_confirmadas_destino / transferencias_detalles_abiertas) * 100)
            if transferencias_detalles_abiertas > 0
            else 0
        )

        stock_por_deposito = self._stock_por_deposito()
        movimientos, _ = self.historial.list_global(limit=movimientos_limit, offset=0)
        transferencias = self._transferencias_recientes(ops_limit)
        inventarios = self._inventarios_recientes(ops_limit)

        return DashboardResumen(
            kpis=DashboardKpis(
                activos_activos=activos_activos,
                depositos_activos=depositos_activos,
                inventarios_abiertos=inventarios_abiertos,
                transferencias_abiertas=transferencias_abiertas,
                stock_total_ubicado=stock_total_ubicado,
                activos_sin_ubicacion=activos_sin_ubicacion,
                cobertura_ubicacion_pct=cobertura_ubicacion_pct,
                inventarios_pendientes_auditoria=inventarios_pendientes_auditoria,
                inventarios_con_discrepancia_pendiente=inventarios_con_discrepancia_pendiente,
                inventarios_activos_pendientes=inventarios_activos_pendientes,
                inventarios_avance_pct=inventarios_avance_pct,
                transferencias_en_transito=transferencias_en_transito,
                transferencias_activos_pendientes=transferencias_activos_pendientes,
                transferencias_avance_pct=transferencias_avance_pct,
                discrepancias_inventarios_cerrados=discrepancias,
            ),
            stock_por_deposito=stock_por_deposito,
            movimientos_recientes=[self._to_movimiento(r) for r in movimientos],
            transferencias_recientes=transferencias,
            inventarios_recientes=inventarios,
            movimientos_limit=movimientos_limit,
            ops_limit=ops_limit,
        )

    def _count(self, stmt) -> int:
        return int(self.db.scalar(stmt) or 0)

    def _stock_por_deposito(self) -> list[StockDepositoResumen]:
        stmt = (
            select(
                Deposito.id,
                Deposito.nombre,
                func.count(Activo.id),
            )
            .select_from(Deposito)
            .outerjoin(Sector, Sector.deposito_id == Deposito.id)
            .outerjoin(Ubicacion, Ubicacion.sector_id == Sector.id)
            .outerjoin(
                Activo,
                (Activo.ubicacion_id == Ubicacion.id) & (Activo.activo.is_(True)),
            )
            .where(Deposito.activo.is_(True))
            .group_by(Deposito.id, Deposito.nombre)
            .order_by(Deposito.nombre)
        )
        rows = self.db.execute(stmt).all()
        return [
            StockDepositoResumen(
                deposito_id=row[0],
                deposito_nombre=row[1],
                total=int(row[2] or 0),
            )
            for row in rows
        ]

    def _transferencias_recientes(self, limit: int) -> list[TransferenciaResumen]:
        rows = list(
            self.db.scalars(
                select(Transferencia)
                .options(selectinload(Transferencia.detalles))
                .order_by(Transferencia.creado_en.desc())
                .limit(limit)
            ).all()
        )
        deposito_ids = {r.deposito_origen_id for r in rows} | {r.deposito_destino_id for r in rows}
        nombres = self._deposito_nombres(deposito_ids)
        result: list[TransferenciaResumen] = []
        for t in rows:
            result.append(
                TransferenciaResumen(
                    id=t.id,
                    deposito_origen_id=t.deposito_origen_id,
                    deposito_origen_nombre=nombres.get(t.deposito_origen_id),
                    deposito_destino_id=t.deposito_destino_id,
                    deposito_destino_nombre=nombres.get(t.deposito_destino_id),
                    estado=t.estado,
                    total_activos=len(t.detalles),
                    confirmados_origen=sum(1 for d in t.detalles if d.confirmado_origen),
                    confirmados_destino=sum(1 for d in t.detalles if d.confirmado_destino),
                    creado_en=t.creado_en,
                )
            )
        return result

    def _inventarios_recientes(self, limit: int) -> list[InventarioResumenItem]:
        rows = list(
            self.db.scalars(
                select(Inventario).order_by(Inventario.iniciado_en.desc()).limit(limit)
            ).all()
        )
        nombres = self._deposito_nombres({r.deposito_id for r in rows})
        return [
            InventarioResumenItem(
                id=inv.id,
                deposito_id=inv.deposito_id,
                deposito_nombre=nombres.get(inv.deposito_id),
                estado=inv.estado,
                total_esperado=inv.total_esperado,
                total_encontrado=inv.total_encontrado,
                total_faltante=inv.total_faltante,
                total_sobrante=inv.total_sobrante,
                iniciado_en=inv.iniciado_en,
                cerrado_en=inv.cerrado_en,
            )
            for inv in rows
        ]

    def _deposito_nombres(self, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not ids:
            return {}
        rows = self.db.scalars(select(Deposito).where(Deposito.id.in_(ids))).all()
        return {d.id: d.nombre for d in rows}

    @staticmethod
    def _to_movimiento(registro: HistorialActivo) -> MovimientoItem:
        activo = getattr(registro, "activo", None)
        return MovimientoItem(
            id=registro.id,
            activo_id=registro.activo_id,
            numero_patrimonial=activo.numero_patrimonial if activo else None,
            descripcion=activo.descripcion if activo else None,
            usuario_id=registro.usuario_id,
            usuario_nombre=getattr(registro, "_usuario_nombre", None),
            accion=registro.accion,
            cambios=registro.cambios,
            creado_en=registro.creado_en,
        )
