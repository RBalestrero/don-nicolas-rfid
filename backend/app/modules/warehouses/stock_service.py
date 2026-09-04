import uuid

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.modules.assets.models import Activo
from app.modules.warehouses.models import Sector, Ubicacion
from app.modules.warehouses.repository import DepositoRepository
from app.modules.warehouses.schemas import (
    StockActivoDetalle,
    StockDepositoResponse,
    StockResumenSector,
)


class StockService:
    def __init__(self, db: Session):
        self.db = db
        self.deposito_repository = DepositoRepository(db)

    def get_stock_deposito(
        self,
        deposito_id: uuid.UUID,
        *,
        sector_id: uuid.UUID | None = None,
        ubicacion_id: uuid.UUID | None = None,
        categoria_id: uuid.UUID | None = None,
        search: str | None = None,
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
            .join(Ubicacion, Activo.ubicacion_id == Ubicacion.id)
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

        por_sector_map: dict[uuid.UUID, dict] = {}
        items: list[StockActivoDetalle] = []

        for activo in activos:
            ubicacion = activo.ubicacion
            assert ubicacion is not None
            sector = ubicacion.sector

            items.append(
                StockActivoDetalle(
                    activo_id=activo.id,
                    numero_patrimonial=activo.numero_patrimonial,
                    descripcion=activo.descripcion,
                    categoria_id=activo.categoria_id,
                    categoria_nombre=activo.categoria.nombre,
                    epc=activo.epc,
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
