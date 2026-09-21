import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.modules.assets.historial_service import HistorialService
from app.modules.assets.models import Activo, Etiqueta
from app.modules.assets.repository import ActivoRepository
from app.modules.auth.models import Usuario
from app.modules.warehouses.models import Sector, Ubicacion
from app.modules.warehouses.repository import UbicacionRepository
from app.modules.warehouses.schemas import (
    AsignacionUbicacionRequest,
    StockActivoItem,
    StockUbicacionResponse,
    UbicacionAsignadaResponse,
)


class AsignacionService:
    def __init__(self, db: Session):
        self.db = db
        self.activo_repository = ActivoRepository(db)
        self.ubicacion_repository = UbicacionRepository(db)
        self.historial = HistorialService(db)

    def asignar_ubicacion(
        self, activo_id: uuid.UUID, data: AsignacionUbicacionRequest, user: Usuario
    ) -> UbicacionAsignadaResponse:
        activo = self._get_activo_activo(activo_id)
        ubicacion = self._get_ubicacion_activa(data.ubicacion_id)

        ubicacion_anterior = str(activo.ubicacion_id) if activo.ubicacion_id else None
        custodio_anterior = (
            str(activo.persona_custodio_id) if activo.persona_custodio_id else None
        )
        activo.ubicacion_id = ubicacion.id
        self._sync_etiquetas_ubicacion(activo.id, ubicacion.id)
        # Solo limpia custodio a nivel SKU si ninguna etiqueta sigue en custodia
        etiquetas = list(
            self.db.scalars(
                select(Etiqueta).where(
                    Etiqueta.activo_id == activo.id, Etiqueta.estado == "activa"
                )
            ).all()
        )
        if not any(et.persona_custodio_id for et in etiquetas):
            activo.persona_custodio_id = None
        self.db.commit()
        self.db.refresh(activo)

        self.historial.registrar(
            activo_id=activo.id,
            accion=HistorialService.ACCION_ASIGNACION_UBICACION,
            usuario=user,
            cambios={
                "ubicacion_id": {
                    "anterior": ubicacion_anterior,
                    "nuevo": str(ubicacion.id),
                },
                "ubicacion_codigo": ubicacion.codigo,
                "deposito": ubicacion.sector.deposito.nombre,
                "persona_custodio_id": {
                    "anterior": custodio_anterior,
                    "nuevo": (
                        str(activo.persona_custodio_id) if activo.persona_custodio_id else None
                    ),
                },
            },
        )

        return self._build_asignacion_response(activo, ubicacion)

    def _sync_etiquetas_ubicacion(
        self, activo_id: uuid.UUID, ubicacion_id: uuid.UUID | None
    ) -> None:
        etiquetas = list(
            self.db.scalars(
                select(Etiqueta).where(
                    Etiqueta.activo_id == activo_id, Etiqueta.estado == "activa"
                )
            ).all()
        )
        for et in etiquetas:
            if et.persona_custodio_id is not None:
                # Unidades en custodia de persona no se reubican por asignación de SKU
                continue
            et.ubicacion_id = ubicacion_id
            if ubicacion_id is not None:
                et.persona_custodio_id = None

    def get_ubicacion_activo(self, activo_id: uuid.UUID) -> UbicacionAsignadaResponse:
        activo = self._get_activo_activo(activo_id)
        ubicacion_id = activo.ubicacion_id
        if not ubicacion_id:
            from collections import Counter

            loc_ids = [
                et.ubicacion_id
                for et in self.db.scalars(
                    select(Etiqueta).where(
                        Etiqueta.activo_id == activo.id, Etiqueta.estado == "activa"
                    )
                ).all()
                if et.ubicacion_id
            ]
            if loc_ids:
                ubicacion_id = Counter(loc_ids).most_common(1)[0][0]
        if not ubicacion_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El activo no tiene ubicación asignada",
            )
        ubicacion = self._get_ubicacion_activa(ubicacion_id)
        return self._build_asignacion_response(activo, ubicacion)

    def desasignar_ubicacion(self, activo_id: uuid.UUID, user: Usuario) -> None:
        activo = self._get_activo_activo(activo_id)
        loc_ids = [
            et.ubicacion_id
            for et in self.db.scalars(
                select(Etiqueta).where(
                    Etiqueta.activo_id == activo.id, Etiqueta.estado == "activa"
                )
            ).all()
            if et.ubicacion_id
        ]
        if not activo.ubicacion_id and not loc_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El activo no tiene ubicación asignada",
            )

        ubicacion_anterior = str(activo.ubicacion_id) if activo.ubicacion_id else str(loc_ids[0])
        activo.ubicacion_id = None
        self._sync_etiquetas_ubicacion(activo.id, None)
        self.db.commit()

        self.historial.registrar(
            activo_id=activo.id,
            accion=HistorialService.ACCION_DESASIGNACION_UBICACION,
            usuario=user,
            cambios={"ubicacion_id": {"anterior": ubicacion_anterior, "nuevo": None}},
        )

    def get_stock_ubicacion(self, ubicacion_id: uuid.UUID) -> StockUbicacionResponse:
        ubicacion = self._get_ubicacion_activa(ubicacion_id)
        stmt = (
            select(Activo)
            .options(joinedload(Activo.categoria))
            .where(Activo.ubicacion_id == ubicacion_id, Activo.activo.is_(True))
            .order_by(Activo.numero_patrimonial)
        )
        activos = list(self.db.scalars(stmt).unique().all())

        return StockUbicacionResponse(
            ubicacion_id=ubicacion.id,
            ubicacion_codigo=ubicacion.codigo,
            sector_id=ubicacion.sector_id,
            sector_nombre=ubicacion.sector.nombre,
            deposito_id=ubicacion.sector.deposito_id,
            deposito_nombre=ubicacion.sector.deposito.nombre,
            total=len(activos),
            activos=[
                StockActivoItem(
                    activo_id=a.id,
                    numero_patrimonial=a.numero_patrimonial,
                    descripcion=a.descripcion,
                    categoria_nombre=a.categoria.nombre,
                    epc=a.epc,
                )
                for a in activos
            ],
        )

    def _get_activo_activo(self, activo_id: uuid.UUID) -> Activo:
        activo = self.activo_repository.get_by_id(activo_id)
        if not activo or not activo.activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Activo no encontrado"
            )
        return activo

    def _get_ubicacion_activa(self, ubicacion_id: uuid.UUID) -> Ubicacion:
        stmt = (
            select(Ubicacion)
            .options(joinedload(Ubicacion.sector).joinedload(Sector.deposito))
            .where(Ubicacion.id == ubicacion_id)
        )
        ubicacion = self.db.scalars(stmt).unique().first()
        if not ubicacion or not ubicacion.activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Ubicación no encontrada"
            )
        if not ubicacion.sector.activo or not ubicacion.sector.deposito.activo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La ubicación pertenece a un sector o depósito inactivo",
            )
        return ubicacion

    def _build_asignacion_response(
        self, activo: Activo, ubicacion: Ubicacion
    ) -> UbicacionAsignadaResponse:
        sector = ubicacion.sector
        deposito = sector.deposito
        return UbicacionAsignadaResponse(
            activo_id=activo.id,
            ubicacion_id=ubicacion.id,
            ubicacion_codigo=ubicacion.codigo,
            sector_id=sector.id,
            sector_nombre=sector.nombre,
            deposito_id=deposito.id,
            deposito_nombre=deposito.nombre,
        )
