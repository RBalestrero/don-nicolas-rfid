import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.assets.models import Activo
from app.modules.inventory.models import Inventario
from app.modules.transfers.models import Transferencia
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
        self.db = db
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
        existing = self.repository.get_by_nombre(data.nombre)
        if existing is not None:
            if existing.activo:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ya existe un depósito con ese nombre",
                )
            # Residuo de baja lógica antigua: liberar el nombre
            self.repository.delete(existing)
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
            if existing is not None and existing.id != deposito.id:
                if existing.activo:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Ya existe un depósito con ese nombre",
                    )
                self.repository.delete(existing)
            deposito.nombre = data.nombre
        if data.descripcion is not None:
            deposito.descripcion = data.descripcion
        if data.direccion is not None:
            deposito.direccion = data.direccion
        if data.activo is not None:
            deposito.activo = data.activo
        return self.repository.update(deposito)

    def delete_deposito(self, deposito_id: uuid.UUID) -> None:
        deposito = self.get_deposito(deposito_id, with_tree=True)
        activos = self._count_activos_en_deposito(deposito_id)
        if activos:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"No se puede eliminar: el depósito tiene {activos} artículo(s) asignados. "
                    "Mové o desasigná el stock antes de eliminarlo."
                ),
            )
        inventarios = self.db.scalar(
            select(func.count()).select_from(Inventario).where(Inventario.deposito_id == deposito_id)
        )
        if inventarios:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"No se puede eliminar: hay {inventarios} inventario(s) asociados. "
                    "Cancelá o cerrá esos inventarios primero."
                ),
            )
        transferencias = self.db.scalar(
            select(func.count())
            .select_from(Transferencia)
            .where(
                (Transferencia.deposito_origen_id == deposito_id)
                | (Transferencia.deposito_destino_id == deposito_id)
            )
        )
        if transferencias:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"No se puede eliminar: el depósito figura en {transferencias} transferencia(s)."
                ),
            )
        self.repository.delete(deposito)

    def _count_activos_en_deposito(self, deposito_id: uuid.UUID) -> int:
        return int(
            self.db.scalar(
                select(func.count())
                .select_from(Activo)
                .join(Ubicacion, Activo.ubicacion_id == Ubicacion.id)
                .join(Sector, Ubicacion.sector_id == Sector.id)
                .where(Sector.deposito_id == deposito_id)
            )
            or 0
        )


class SectorService:
    def __init__(self, db: Session):
        self.db = db
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
        existing = self.repository.get_by_nombre(deposito_id, data.nombre)
        if existing is not None:
            if existing.activo:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ya existe un sector con ese nombre en el depósito",
                )
            self.repository.delete(existing)
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
            if existing is not None and existing.id != sector.id:
                if existing.activo:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Ya existe un sector con ese nombre en el depósito",
                    )
                self.repository.delete(existing)
            sector.nombre = data.nombre
        if data.descripcion is not None:
            sector.descripcion = data.descripcion
        if data.activo is not None:
            sector.activo = data.activo
        return self.repository.update(sector)

    def delete_sector(self, deposito_id: uuid.UUID, sector_id: uuid.UUID) -> None:
        sector = self._get_sector_or_404(deposito_id, sector_id)
        activos = self._count_activos_en_sector(sector_id)
        if activos:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"No se puede eliminar: el sector tiene {activos} artículo(s) en sus ubicaciones. "
                    "Desasigná o mové el stock primero."
                ),
            )
        self.repository.delete(sector)

    def _count_activos_en_sector(self, sector_id: uuid.UUID) -> int:
        return int(
            self.db.scalar(
                select(func.count())
                .select_from(Activo)
                .join(Ubicacion, Activo.ubicacion_id == Ubicacion.id)
                .where(Ubicacion.sector_id == sector_id)
            )
            or 0
        )

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
        self.db = db
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
        existing = self.repository.get_by_codigo(sector_id, data.codigo)
        if existing is not None:
            if existing.activo:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ya existe una ubicación con ese código en el sector",
                )
            self.repository.delete(existing)
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
            if existing is not None and existing.id != ubicacion.id:
                if existing.activo:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Ya existe una ubicación con ese código en el sector",
                    )
                self.repository.delete(existing)
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
        activos = int(
            self.db.scalar(
                select(func.count())
                .select_from(Activo)
                .where(Activo.ubicacion_id == ubicacion_id)
            )
            or 0
        )
        if activos:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"No se puede eliminar: la ubicación tiene {activos} artículo(s) asignados. "
                    "Desasigná o mové el stock primero."
                ),
            )
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
