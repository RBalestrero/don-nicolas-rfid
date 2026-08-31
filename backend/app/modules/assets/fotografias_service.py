import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.storage import save_upload
from app.modules.assets.models import Activo, Fotografia
from app.modules.assets.repository import ActivoRepository
from app.modules.assets.schemas import FotografiaResponse


class FotografiaRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, foto_id: uuid.UUID) -> Fotografia | None:
        return self.db.get(Fotografia, foto_id)

    def list_by_activo(self, activo_id: uuid.UUID) -> list[Fotografia]:
        stmt = (
            select(Fotografia)
            .where(Fotografia.activo_id == activo_id)
            .order_by(Fotografia.es_principal.desc(), Fotografia.creado_en.desc())
        )
        return list(self.db.scalars(stmt).all())

    def create(self, fotografia: Fotografia) -> Fotografia:
        self.db.add(fotografia)
        self.db.commit()
        self.db.refresh(fotografia)
        return fotografia

    def clear_principal(self, activo_id: uuid.UUID) -> None:
        self.db.execute(
            update(Fotografia)
            .where(Fotografia.activo_id == activo_id)
            .values(es_principal=False)
        )

    def delete(self, fotografia: Fotografia) -> None:
        self.db.delete(fotografia)
        self.db.commit()


class FotografiaService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = FotografiaRepository(db)
        self.activo_repository = ActivoRepository(db)

    def _ensure_activo(self, activo_id: uuid.UUID) -> Activo:
        activo = self.activo_repository.get_by_id(activo_id)
        if not activo or not activo.activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Activo no encontrado"
            )
        return activo

    def _to_response(self, fotografia: Fotografia) -> FotografiaResponse:
        return FotografiaResponse(
            id=fotografia.id,
            activo_id=fotografia.activo_id,
            nombre_archivo=fotografia.nombre_archivo,
            mime_type=fotografia.mime_type,
            tamano_bytes=fotografia.tamano_bytes,
            es_principal=fotografia.es_principal,
            creado_en=fotografia.creado_en,
            url=f"/api/v1/fotografias/{fotografia.id}/archivo",
        )

    async def upload(
        self,
        activo_id: uuid.UUID,
        file: UploadFile,
        es_principal: bool = False,
    ) -> FotografiaResponse:
        self._ensure_activo(activo_id)
        ruta, nombre_archivo, tamano = await save_upload(file, activo_id)

        if es_principal:
            self.repository.clear_principal(activo_id)

        es_primera = len(self.repository.list_by_activo(activo_id)) == 0
        fotografia = Fotografia(
            activo_id=activo_id,
            nombre_archivo=nombre_archivo,
            ruta=ruta,
            mime_type=file.content_type or "application/octet-stream",
            tamano_bytes=tamano,
            es_principal=es_principal or es_primera,
        )
        created = self.repository.create(fotografia)
        return self._to_response(created)

    def list_fotografias(self, activo_id: uuid.UUID) -> list[FotografiaResponse]:
        self._ensure_activo(activo_id)
        return [self._to_response(f) for f in self.repository.list_by_activo(activo_id)]

    def get_fotografia(self, foto_id: uuid.UUID) -> Fotografia:
        fotografia = self.repository.get_by_id(foto_id)
        if not fotografia:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Fotografía no encontrada"
            )
        return fotografia

    def get_file_path(self, foto_id: uuid.UUID) -> tuple[Path, str]:
        fotografia = self.get_fotografia(foto_id)
        path = Path(fotografia.ruta)
        if not path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado"
            )
        return path, fotografia.mime_type

    def delete_fotografia(self, foto_id: uuid.UUID) -> None:
        fotografia = self.get_fotografia(foto_id)
        path = Path(fotografia.ruta)
        self.repository.delete(fotografia)
        if path.exists():
            path.unlink()
