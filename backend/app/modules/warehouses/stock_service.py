import uuid

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.modules.assets.models import Activo, Etiqueta
from app.modules.assets.repository import EtiquetaRepository
from app.modules.warehouses.models import Sector, Ubicacion
from app.modules.warehouses.repository import DepositoRepository
from app.modules.warehouses.schemas import (
    ActivoUbicacionStockItem,
    StockActivoDetalle,
    StockDepositoResponse,
    StockResumenSector,
)


class StockService:
    def __init__(self, db: Session):
        self.db = db
        self.deposito_repository = DepositoRepository(db)
        self.etiqueta_repository = EtiquetaRepository(db)

    def get_stock_deposito(
        self,
        deposito_id: uuid.UUID,
        *,
        sector_id: uuid.UUID | None = None,
        ubicacion_id: uuid.UUID | None = None,
        categoria_id: uuid.UUID | None = None,
        search: str | None = None,
        activo_id: uuid.UUID | None = None,
    ) -> StockDepositoResponse:
        deposito = self.deposito_repository.get_by_id(deposito_id)
        if not deposito or not deposito.activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Depósito no encontrado"
            )

        if sector_id is not None:
            self._ensure_sector_in_deposito(deposito_id, sector_id)

        if ubicacion_id is not None:
            self._ensure_ubicacion_in_deposito(deposito_id, ubicacion_id, sector_id)

        stmt = (
            select(Activo)
            .outerjoin(Etiqueta, (Etiqueta.activo_id == Activo.id) & (Etiqueta.estado == "activa"))
            .outerjoin(
                Ubicacion,
                or_(Activo.ubicacion_id == Ubicacion.id, Etiqueta.ubicacion_id == Ubicacion.id),
            )
            .join(Sector, Ubicacion.sector_id == Sector.id)
            .options(
                joinedload(Activo.categoria),
                joinedload(Activo.ubicacion).joinedload(Ubicacion.sector),
            )
            .where(
                Sector.deposito_id == deposito_id,
                Activo.activo.is_(True),
                Ubicacion.activo.is_(True),
                Sector.activo.is_(True),
            )
            .order_by(Sector.nombre, Ubicacion.codigo, Activo.numero_patrimonial)
        )

        if sector_id is not None:
            stmt = stmt.where(Sector.id == sector_id)
        if ubicacion_id is not None:
            stmt = stmt.where(Ubicacion.id == ubicacion_id)
        if categoria_id is not None:
            stmt = stmt.where(Activo.categoria_id == categoria_id)
        if activo_id is not None:
            stmt = stmt.where(Activo.id == activo_id)
        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Activo.numero_patrimonial.ilike(pattern),
                    Activo.descripcion.ilike(pattern),
                    Activo.epc.ilike(pattern),
                )
            )

        activos = list(self.db.scalars(stmt).unique().all())
        etiquetas_by_activo: dict[uuid.UUID, list] = {}
        for et in self.etiqueta_repository.list_activas_by_activo_ids([a.id for a in activos]):
            etiquetas_by_activo.setdefault(et.activo_id, []).append(et)

        ubicaciones_ids = {
            et.ubicacion_id
            for ets in etiquetas_by_activo.values()
            for et in ets
            if et.ubicacion_id
        }
        for activo in activos:
            if activo.ubicacion_id:
                ubicaciones_ids.add(activo.ubicacion_id)
        ubicaciones = {
            u.id: u
            for u in self.db.scalars(
                select(Ubicacion)
                .options(joinedload(Ubicacion.sector))
                .where(Ubicacion.id.in_(list(ubicaciones_ids)))
            ).unique().all()
        } if ubicaciones_ids else {}

        por_sector_map: dict[uuid.UUID, dict] = {}
        items: list[StockActivoDetalle] = []

        def _append_unidad(
            activo: Activo,
            epc: str | None,
            ubicacion: Ubicacion,
        ) -> None:
            if sector_id is not None and ubicacion.sector_id != sector_id:
                return
            if ubicacion_id is not None and ubicacion.id != ubicacion_id:
                return
            sector = ubicacion.sector
            if sector.deposito_id != deposito_id or not ubicacion.activo or not sector.activo:
                return
            items.append(
                StockActivoDetalle(
                    activo_id=activo.id,
                    numero_patrimonial=activo.numero_patrimonial,
                    descripcion=activo.descripcion,
                    categoria_id=activo.categoria_id,
                    categoria_nombre=activo.categoria.nombre,
                    epc=epc,
                    ubicacion_id=ubicacion.id,
                    ubicacion_codigo=ubicacion.codigo,
                    sector_id=sector.id,
                    sector_nombre=sector.nombre,
                )
            )
            resumen = por_sector_map.setdefault(
                sector.id,
                {
                    "sector_id": sector.id,
                    "sector_nombre": sector.nombre,
                    "total": 0,
                    "ubicaciones": set(),
                },
            )
            resumen["total"] += 1
            resumen["ubicaciones"].add(ubicacion.id)

        for activo in activos:
            etiquetas = etiquetas_by_activo.get(activo.id, [])
            if etiquetas:
                for et in etiquetas:
                    if et.persona_custodio_id is not None:
                        continue
                    loc_id = et.ubicacion_id or activo.ubicacion_id
                    ubicacion = ubicaciones.get(loc_id) if loc_id else None
                    if ubicacion is None:
                        continue
                    _append_unidad(activo, et.epc, ubicacion)
            else:
                if activo.persona_custodio_id is not None:
                    continue
                ubicacion = activo.ubicacion
                if ubicacion is None:
                    continue
                _append_unidad(activo, activo.epc, ubicacion)

        por_sector = [
            StockResumenSector(
                sector_id=r["sector_id"],
                sector_nombre=r["sector_nombre"],
                total=r["total"],
                ubicaciones=len(r["ubicaciones"]),
            )
            for r in sorted(por_sector_map.values(), key=lambda x: x["sector_nombre"])
        ]

        return StockDepositoResponse(
            deposito_id=deposito.id,
            deposito_nombre=deposito.nombre,
            total=len(items),
            filtros={
                "sector_id": str(sector_id) if sector_id else None,
                "ubicacion_id": str(ubicacion_id) if ubicacion_id else None,
                "categoria_id": str(categoria_id) if categoria_id else None,
                "search": search,
            },
            por_sector=por_sector,
            activos=items,
        )

    def list_ubicaciones_con_stock(
        self, activo_id: uuid.UUID
    ) -> list[ActivoUbicacionStockItem]:
        """Ubicaciones (cualquier depósito) con unidades activas de este artículo."""
        activo = self.db.get(Activo, activo_id)
        if activo is None or not activo.activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Artículo no encontrado"
            )

        etiquetas = [
            et
            for et in self.etiqueta_repository.list_activas_by_activo_ids([activo_id])
            if et.persona_custodio_id is None
        ]

        counts: dict[uuid.UUID, int] = {}
        if etiquetas:
            for et in etiquetas:
                loc_id = et.ubicacion_id or activo.ubicacion_id
                if loc_id is None:
                    continue
                counts[loc_id] = counts.get(loc_id, 0) + 1
        elif activo.persona_custodio_id is None and activo.ubicacion_id is not None:
            counts[activo.ubicacion_id] = 1

        if not counts:
            return []

        ubicaciones = list(
            self.db.scalars(
                select(Ubicacion)
                .options(
                    joinedload(Ubicacion.sector).joinedload(Sector.deposito),
                )
                .where(
                    Ubicacion.id.in_(list(counts.keys())),
                    Ubicacion.activo.is_(True),
                )
            )
            .unique()
            .all()
        )

        items: list[ActivoUbicacionStockItem] = []
        for ubicacion in ubicaciones:
            sector = ubicacion.sector
            if sector is None or not sector.activo:
                continue
            deposito = sector.deposito
            if deposito is None or not deposito.activo:
                continue
            items.append(
                ActivoUbicacionStockItem(
                    deposito_id=deposito.id,
                    deposito_nombre=deposito.nombre,
                    sector_id=sector.id,
                    sector_nombre=sector.nombre,
                    ubicacion_id=ubicacion.id,
                    ubicacion_codigo=ubicacion.codigo,
                    cantidad=counts.get(ubicacion.id, 0),
                )
            )

        items.sort(
            key=lambda r: (
                r.deposito_nombre.lower(),
                r.sector_nombre.lower(),
                r.ubicacion_codigo.lower(),
            )
        )
        return items

    def _ensure_sector_in_deposito(
        self, deposito_id: uuid.UUID, sector_id: uuid.UUID
    ) -> Sector:
        sector = self.db.get(Sector, sector_id)
        if not sector or sector.deposito_id != deposito_id or not sector.activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Sector no encontrado"
            )
        return sector

    def _ensure_ubicacion_in_deposito(
        self,
        deposito_id: uuid.UUID,
        ubicacion_id: uuid.UUID,
        sector_id: uuid.UUID | None = None,
    ) -> Ubicacion:
        stmt = (
            select(Ubicacion)
            .options(joinedload(Ubicacion.sector))
            .where(Ubicacion.id == ubicacion_id)
        )
        ubicacion = self.db.scalars(stmt).unique().first()
        if (
            not ubicacion
            or not ubicacion.activo
            or ubicacion.sector.deposito_id != deposito_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Ubicación no encontrada"
            )
        if sector_id is not None and ubicacion.sector_id != sector_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La ubicación no pertenece al sector indicado",
            )
        return ubicacion
