import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.modules.assets.models import Activo, HistorialActivo
from app.modules.auth.models import Usuario


def _serialize(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    return value


class HistorialService:
    ACCION_CREACION = "creacion"
    ACCION_ACTUALIZACION = "actualizacion"
    ACCION_DESACTIVACION = "desactivacion"
    ACCION_FOTO_AGREGADA = "foto_agregada"
    ACCION_FOTO_ELIMINADA = "foto_eliminada"
    ACCION_ETIQUETA_IMPRESA = "etiqueta_impresa"
    ACCION_ASIGNACION_UBICACION = "asignacion_ubicacion"
    ACCION_DESASIGNACION_UBICACION = "desasignacion_ubicacion"
    ACCION_TRANSFERENCIA = "transferencia"

    def __init__(self, db: Session):
        self.db = db

    def registrar(
        self,
        activo_id: uuid.UUID,
        accion: str,
        usuario: Usuario | None = None,
        cambios: dict | None = None,
    ) -> HistorialActivo:
        registro = HistorialActivo(
            activo_id=activo_id,
            usuario_id=usuario.id if usuario else None,
            accion=accion,
            cambios=_serialize(cambios) if cambios else None,
        )
        self.db.add(registro)
        self.db.commit()
        self.db.refresh(registro)
        return registro

    def list_by_activo(self, activo_id: uuid.UUID) -> list[HistorialActivo]:
        stmt = (
            select(HistorialActivo)
            .options(joinedload(HistorialActivo.activo))
            .where(HistorialActivo.activo_id == activo_id)
            .order_by(HistorialActivo.creado_en.desc())
        )
        registros = list(self.db.scalars(stmt).unique().all())
        self._attach_usuario_nombres(registros)
        return registros

    def list_global(
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
    ) -> tuple[list[HistorialActivo], int]:
        filters = []
        if accion:
            filters.append(HistorialActivo.accion == accion)
        if activo_id:
            filters.append(HistorialActivo.activo_id == activo_id)
        if usuario_id:
            filters.append(HistorialActivo.usuario_id == usuario_id)
        if desde:
            filters.append(HistorialActivo.creado_en >= desde)
        if hasta:
            filters.append(HistorialActivo.creado_en <= hasta)

        needs_activo_join = bool(search and search.strip())

        count_stmt = select(func.count()).select_from(HistorialActivo)
        if needs_activo_join:
            count_stmt = count_stmt.join(Activo, Activo.id == HistorialActivo.activo_id)
            filters.append(self._search_filter(search.strip()))
        if filters:
            count_stmt = count_stmt.where(*filters)
        total = int(self.db.scalar(count_stmt) or 0)

        stmt = (
            select(HistorialActivo)
            .options(joinedload(HistorialActivo.activo))
            .order_by(HistorialActivo.creado_en.desc())
            .offset(max(offset, 0))
            .limit(min(max(limit, 1), 10_000))
        )
        if needs_activo_join:
            stmt = stmt.join(Activo, Activo.id == HistorialActivo.activo_id)
        if filters:
            stmt = stmt.where(*filters)

        registros = list(self.db.scalars(stmt).unique().all())
        self._attach_usuario_nombres(registros)
        return registros, total

    @staticmethod
    def _search_filter(term: str):
        like = f"%{term}%"
        return Activo.numero_patrimonial.ilike(like) | Activo.descripcion.ilike(like)

    def _attach_usuario_nombres(self, registros: list[HistorialActivo]) -> None:
        usuario_ids = {r.usuario_id for r in registros if r.usuario_id}
        usuarios: dict[uuid.UUID, Usuario] = {}
        if usuario_ids:
            stmt_users = select(Usuario).where(Usuario.id.in_(usuario_ids))
            usuarios = {u.id: u for u in self.db.scalars(stmt_users).all()}

        for registro in registros:
            registro._usuario_nombre = (  # type: ignore[attr-defined]
                usuarios[registro.usuario_id].nombre if registro.usuario_id in usuarios else None
            )
