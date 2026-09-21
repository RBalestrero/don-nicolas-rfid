import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.assets.models import Activo, ActivoObservacion
from app.modules.auth.models import Usuario


class ObservacionService:
    def __init__(self, db: Session):
        self.db = db

    def _get_activo_or_404(self, activo_id: uuid.UUID) -> Activo:
        activo = self.db.get(Activo, activo_id)
        if not activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Activo no encontrado"
            )
        return activo

    def list_by_activo(self, activo_id: uuid.UUID) -> list[ActivoObservacion]:
        self._get_activo_or_404(activo_id)
        stmt = (
            select(ActivoObservacion)
            .where(ActivoObservacion.activo_id == activo_id)
            .order_by(ActivoObservacion.creado_en.desc())
        )
        observaciones = list(self.db.scalars(stmt).all())
        self._attach_usuario_nombres(observaciones)
        return observaciones

    def create(
        self, activo_id: uuid.UUID, texto: str, usuario: Usuario
    ) -> ActivoObservacion:
        self._get_activo_or_404(activo_id)
        observacion = ActivoObservacion(
            activo_id=activo_id,
            usuario_id=usuario.id,
            texto=texto,
        )
        self.db.add(observacion)
        self.db.commit()
        self.db.refresh(observacion)
        observacion._usuario_nombre = usuario.nombre  # type: ignore[attr-defined]
        return observacion

    def delete(
        self, activo_id: uuid.UUID, observacion_id: uuid.UUID
    ) -> None:
        self._get_activo_or_404(activo_id)
        observacion = self.db.get(ActivoObservacion, observacion_id)
        if not observacion or observacion.activo_id != activo_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Observación no encontrada",
            )
        self.db.delete(observacion)
        self.db.commit()

    def _attach_usuario_nombres(self, observaciones: list[ActivoObservacion]) -> None:
        usuario_ids = {o.usuario_id for o in observaciones if o.usuario_id}
        usuarios: dict[uuid.UUID, Usuario] = {}
        if usuario_ids:
            stmt_users = select(Usuario).where(Usuario.id.in_(usuario_ids))
            usuarios = {u.id: u for u in self.db.scalars(stmt_users).all()}

        for observacion in observaciones:
            observacion._usuario_nombre = (  # type: ignore[attr-defined]
                usuarios[observacion.usuario_id].nombre
                if observacion.usuario_id in usuarios
                else None
            )
