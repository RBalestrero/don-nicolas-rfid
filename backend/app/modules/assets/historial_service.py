import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.modules.assets.models import HistorialActivo
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

        usuario_ids = {r.usuario_id for r in registros if r.usuario_id}
        usuarios: dict[uuid.UUID, Usuario] = {}
        if usuario_ids:
            stmt_users = select(Usuario).where(Usuario.id.in_(usuario_ids))
            usuarios = {u.id: u for u in self.db.scalars(stmt_users).all()}

        for registro in registros:
            registro._usuario_nombre = (  # type: ignore[attr-defined]
                usuarios[registro.usuario_id].nombre if registro.usuario_id in usuarios else None
            )
        return registros
