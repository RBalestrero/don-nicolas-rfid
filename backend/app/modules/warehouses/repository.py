import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.modules.warehouses.models import Deposito, Sector, Ubicacion


class DepositoRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self, include_inactive: bool = False) -> list[Deposito]:
        stmt = select(Deposito).order_by(Deposito.nombre)
        if not include_inactive:
            stmt = stmt.where(Deposito.activo.is_(True))
        return list(self.db.scalars(stmt).all())

    def get_by_id(self, deposito_id: uuid.UUID, with_tree: bool = False) -> Deposito | None:
        stmt = select(Deposito).where(Deposito.id == deposito_id)
        if with_tree:
            stmt = stmt.options(
                joinedload(Deposito.sectores).joinedload(Sector.ubicaciones)
            )
            return self.db.scalars(stmt).unique().first()
        return self.db.scalars(stmt).first()

    def get_by_nombre(self, nombre: str) -> Deposito | None:
        return self.db.scalars(select(Deposito).where(Deposito.nombre == nombre)).first()

    def create(self, deposito: Deposito) -> Deposito:
        self.db.add(deposito)
        self.db.commit()
        self.db.refresh(deposito)
        return deposito

    def update(self, deposito: Deposito) -> Deposito:
        self.db.commit()
        self.db.refresh(deposito)
        return deposito

    def delete(self, deposito: Deposito) -> None:
        deposito.activo = False
        self.db.commit()


class SectorRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_deposito(
        self, deposito_id: uuid.UUID, include_inactive: bool = False
    ) -> list[Sector]:
        stmt = select(Sector).where(Sector.deposito_id == deposito_id).order_by(Sector.nombre)
        if not include_inactive:
            stmt = stmt.where(Sector.activo.is_(True))
        return list(self.db.scalars(stmt).all())

    def get_by_id(self, sector_id: uuid.UUID) -> Sector | None:
        return self.db.get(Sector, sector_id)

    def get_by_nombre(self, deposito_id: uuid.UUID, nombre: str) -> Sector | None:
        return self.db.scalars(
            select(Sector).where(Sector.deposito_id == deposito_id, Sector.nombre == nombre)
        ).first()

    def create(self, sector: Sector) -> Sector:
        self.db.add(sector)
        self.db.commit()
        self.db.refresh(sector)
        return sector

    def update(self, sector: Sector) -> Sector:
        self.db.commit()
        self.db.refresh(sector)
        return sector

    def delete(self, sector: Sector) -> None:
        sector.activo = False
        self.db.commit()


class UbicacionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_sector(
        self, sector_id: uuid.UUID, include_inactive: bool = False
    ) -> list[Ubicacion]:
        stmt = (
            select(Ubicacion).where(Ubicacion.sector_id == sector_id).order_by(Ubicacion.codigo)
        )
        if not include_inactive:
            stmt = stmt.where(Ubicacion.activo.is_(True))
        return list(self.db.scalars(stmt).all())

    def get_by_id(self, ubicacion_id: uuid.UUID) -> Ubicacion | None:
        return self.db.get(Ubicacion, ubicacion_id)

    def get_by_codigo(self, sector_id: uuid.UUID, codigo: str) -> Ubicacion | None:
        return self.db.scalars(
            select(Ubicacion).where(Ubicacion.sector_id == sector_id, Ubicacion.codigo == codigo)
        ).first()

    def create(self, ubicacion: Ubicacion) -> Ubicacion:
        self.db.add(ubicacion)
        self.db.commit()
        self.db.refresh(ubicacion)
        return ubicacion

    def update(self, ubicacion: Ubicacion) -> Ubicacion:
        self.db.commit()
        self.db.refresh(ubicacion)
        return ubicacion

    def delete(self, ubicacion: Ubicacion) -> None:
        ubicacion.activo = False
        self.db.commit()
