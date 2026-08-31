import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.modules.warehouses.models import Deposito, Sector, Ubicacion
from app.modules.warehouses.repository import (
    DepositoRepository,
    SectorRepository,
    UbicacionRepository,
)
from app.modules.warehouses.schemas import (
    DepositoCreate,
    DepositoUpdate,
    SectorCreate,
    SectorUpdate,
    UbicacionCreate,
    UbicacionUpdate,
)


class DepositoService:
    def __init__(self, db: Session):
        self.repository = DepositoRepository(db)
        self.sector_repository = SectorRepository(db)

    def list_depositos(self, include_inactive: bool = False) -> list[Deposito]:
        return self.repository.get_all(include_inactive=include_inactive)

    def get_deposito(self, deposito_id: uuid.UUID, with_tree: bool = False) -> Deposito:
        deposito = self.repository.get_by_id(deposito_id, with_tree=with_tree)
        if not deposito:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Depósito no encontrado"
            )
        return deposito

    def create_deposito(self, data: DepositoCreate) -> Deposito:
        if self.repository.get_by_nombre(data.nombre):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un depósito con ese nombre",
            )
        deposito = Deposito(
            nombre=data.nombre,
            descripcion=data.descripcion,
            direccion=data.direccion,
        )
        return self.repository.create(deposito)

    def update_deposito(self, deposito_id: uuid.UUID, data: DepositoUpdate) -> Deposito:
        deposito = self.get_deposito(deposito_id)
        if data.nombre and data.nombre != deposito.nombre:
            existing = self.repository.get_by_nombre(data.nombre)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ya existe un depósito con ese nombre",
                )
            deposito.nombre = data.nombre
        if data.descripcion is not None:
            deposito.descripcion = data.descripcion
        if data.direccion is not None:
            deposito.direccion = data.direccion
        if data.activo is not None:
            deposito.activo = data.activo
        return self.repository.update(deposito)

    def delete_deposito(self, deposito_id: uuid.UUID) -> None:
        deposito = self.get_deposito(deposito_id)
        self.repository.delete(deposito)


class SectorService:
    def __init__(self, db: Session):
        self.deposito_repository = DepositoRepository(db)
        self.repository = SectorRepository(db)

    def list_sectores(
        self, deposito_id: uuid.UUID, include_inactive: bool = False
    ) -> list[Sector]:
        self._ensure_deposito(deposito_id)
        return self.repository.get_by_deposito(deposito_id, include_inactive=include_inactive)

    def get_sector(self, deposito_id: uuid.UUID, sector_id: uuid.UUID) -> Sector:
        sector = self._get_sector_or_404(deposito_id, sector_id)
        return sector

    def create_sector(self, deposito_id: uuid.UUID, data: SectorCreate) -> Sector:
        self._ensure_deposito(deposito_id)
        if self.repository.get_by_nombre(deposito_id, data.nombre):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un sector con ese nombre en el depósito",
            )
        sector = Sector(
            deposito_id=deposito_id,
            nombre=data.nombre,
            descripcion=data.descripcion,
        )
        return self.repository.create(sector)

    def update_sector(
        self, deposito_id: uuid.UUID, sector_id: uuid.UUID, data: SectorUpdate
    ) -> Sector:
        sector = self._get_sector_or_404(deposito_id, sector_id)
        if data.nombre and data.nombre != sector.nombre:
            existing = self.repository.get_by_nombre(deposito_id, data.nombre)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ya existe un sector con ese nombre en el depósito",
                )
            sector.nombre = data.nombre
        if data.descripcion is not None:
            sector.descripcion = data.descripcion
        if data.activo is not None:
            sector.activo = data.activo
        return self.repository.update(sector)

    def delete_sector(self, deposito_id: uuid.UUID, sector_id: uuid.UUID) -> None:
        sector = self._get_sector_or_404(deposito_id, sector_id)
        self.repository.delete(sector)

    def _ensure_deposito(self, deposito_id: uuid.UUID) -> Deposito:
        deposito = self.deposito_repository.get_by_id(deposito_id)
        if not deposito or not deposito.activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Depósito no encontrado"
            )
        return deposito

    def _get_sector_or_404(self, deposito_id: uuid.UUID, sector_id: uuid.UUID) -> Sector:
        sector = self.repository.get_by_id(sector_id)
        if not sector or sector.deposito_id != deposito_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Sector no encontrado"
            )
        return sector


class UbicacionService:
    def __init__(self, db: Session):
        self.sector_repository = SectorRepository(db)
        self.repository = UbicacionRepository(db)

    def list_ubicaciones(
        self, deposito_id: uuid.UUID, sector_id: uuid.UUID, include_inactive: bool = False
    ) -> list[Ubicacion]:
        self._ensure_sector(deposito_id, sector_id)
        return self.repository.get_by_sector(sector_id, include_inactive=include_inactive)

    def get_ubicacion(
        self, deposito_id: uuid.UUID, sector_id: uuid.UUID, ubicacion_id: uuid.UUID
    ) -> Ubicacion:
        return self._get_ubicacion_or_404(deposito_id, sector_id, ubicacion_id)

    def create_ubicacion(
        self, deposito_id: uuid.UUID, sector_id: uuid.UUID, data: UbicacionCreate
    ) -> Ubicacion:
        self._ensure_sector(deposito_id, sector_id)
        if self.repository.get_by_codigo(sector_id, data.codigo):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una ubicación con ese código en el sector",
            )
        ubicacion = Ubicacion(
            sector_id=sector_id,
            codigo=data.codigo,
            descripcion=data.descripcion,
        )
        return self.repository.create(ubicacion)

    def update_ubicacion(
        self,
        deposito_id: uuid.UUID,
        sector_id: uuid.UUID,
        ubicacion_id: uuid.UUID,
        data: UbicacionUpdate,
    ) -> Ubicacion:
        ubicacion = self._get_ubicacion_or_404(deposito_id, sector_id, ubicacion_id)
        if data.codigo and data.codigo != ubicacion.codigo:
            existing = self.repository.get_by_codigo(sector_id, data.codigo)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ya existe una ubicación con ese código en el sector",
                )
            ubicacion.codigo = data.codigo
        if data.descripcion is not None:
            ubicacion.descripcion = data.descripcion
        if data.activo is not None:
            ubicacion.activo = data.activo
        return self.repository.update(ubicacion)

    def delete_ubicacion(
        self, deposito_id: uuid.UUID, sector_id: uuid.UUID, ubicacion_id: uuid.UUID
    ) -> None:
        ubicacion = self._get_ubicacion_or_404(deposito_id, sector_id, ubicacion_id)
        self.repository.delete(ubicacion)

    def _ensure_sector(self, deposito_id: uuid.UUID, sector_id: uuid.UUID) -> Sector:
        sector = self.sector_repository.get_by_id(sector_id)
        if not sector or sector.deposito_id != deposito_id or not sector.activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Sector no encontrado"
            )
        return sector

    def _get_ubicacion_or_404(
        self, deposito_id: uuid.UUID, sector_id: uuid.UUID, ubicacion_id: uuid.UUID
    ) -> Ubicacion:
        self._ensure_sector(deposito_id, sector_id)
        ubicacion = self.repository.get_by_id(ubicacion_id)
        if not ubicacion or ubicacion.sector_id != sector_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Ubicación no encontrada"
            )
        return ubicacion
