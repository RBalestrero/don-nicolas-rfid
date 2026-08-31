import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.modules.assets.models import Activo, Categoria
from app.modules.assets.repository import ActivoRepository, CategoriaRepository
from app.modules.assets.schemas import (
    ActivoCreate,
    ActivoUpdate,
    CategoriaCreate,
    CategoriaUpdate,
)
from app.modules.auth.models import Usuario


class CategoriaService:
    def __init__(self, db: Session):
        self.repository = CategoriaRepository(db)

    def list_categorias(self, include_inactive: bool = False) -> list[Categoria]:
        return self.repository.get_all(include_inactive=include_inactive)

    def get_categoria(self, categoria_id: uuid.UUID) -> Categoria:
        categoria = self.repository.get_by_id(categoria_id)
        if not categoria:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Categoría no encontrada"
            )
        return categoria

    def create_categoria(self, data: CategoriaCreate) -> Categoria:
        if self.repository.get_by_nombre(data.nombre):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una categoría con ese nombre",
            )
        categoria = Categoria(nombre=data.nombre, descripcion=data.descripcion)
        return self.repository.create(categoria)

    def update_categoria(self, categoria_id: uuid.UUID, data: CategoriaUpdate) -> Categoria:
        categoria = self.get_categoria(categoria_id)
        if data.nombre and data.nombre != categoria.nombre:
            existing = self.repository.get_by_nombre(data.nombre)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ya existe una categoría con ese nombre",
                )
            categoria.nombre = data.nombre
        if data.descripcion is not None:
            categoria.descripcion = data.descripcion
        if data.activa is not None:
            categoria.activa = data.activa
        return self.repository.update(categoria)

    def delete_categoria(self, categoria_id: uuid.UUID) -> None:
        categoria = self.get_categoria(categoria_id)
        self.repository.delete(categoria)


class ActivoService:
    def __init__(self, db: Session):
        self.repository = ActivoRepository(db)
        self.categoria_repository = CategoriaRepository(db)

    def list_activos(
        self,
        categoria_id: uuid.UUID | None = None,
        search: str | None = None,
        include_inactive: bool = False,
    ) -> list[Activo]:
        return self.repository.get_all(
            categoria_id=categoria_id,
            search=search,
            include_inactive=include_inactive,
        )

    def get_activo(self, activo_id: uuid.UUID) -> Activo:
        activo = self.repository.get_by_id(activo_id)
        if not activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Activo no encontrado"
            )
        return activo

    def create_activo(self, data: ActivoCreate, user: Usuario) -> Activo:
        categoria = self.categoria_repository.get_by_id(data.categoria_id)
        if not categoria or not categoria.activa:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Categoría inválida"
            )

        if self.repository.get_by_numero_patrimonial(data.numero_patrimonial):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un activo con ese número patrimonial",
            )

        if data.epc and self.repository.get_by_epc(data.epc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un activo con ese EPC",
            )

        activo = Activo(
            numero_patrimonial=data.numero_patrimonial,
            descripcion=data.descripcion,
            categoria_id=data.categoria_id,
            epc=data.epc,
            datos_tecnicos=data.datos_tecnicos,
            creado_por_id=user.id,
        )
        return self.repository.create(activo)

    def update_activo(self, activo_id: uuid.UUID, data: ActivoUpdate) -> Activo:
        activo = self.get_activo(activo_id)

        if data.numero_patrimonial and data.numero_patrimonial != activo.numero_patrimonial:
            existing = self.repository.get_by_numero_patrimonial(data.numero_patrimonial)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ya existe un activo con ese número patrimonial",
                )
            activo.numero_patrimonial = data.numero_patrimonial

        if data.descripcion is not None:
            activo.descripcion = data.descripcion

        if data.categoria_id is not None:
            categoria = self.categoria_repository.get_by_id(data.categoria_id)
            if not categoria or not categoria.activa:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Categoría inválida"
                )
            activo.categoria_id = data.categoria_id

        if data.epc is not None and data.epc != activo.epc:
            if data.epc:
                existing = self.repository.get_by_epc(data.epc)
                if existing:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Ya existe un activo con ese EPC",
                    )
            activo.epc = data.epc

        if data.datos_tecnicos is not None:
            activo.datos_tecnicos = data.datos_tecnicos

        if data.activo is not None:
            activo.activo = data.activo

        return self.repository.update(activo)

    def delete_activo(self, activo_id: uuid.UUID) -> None:
        activo = self.get_activo(activo_id)
        self.repository.delete(activo)
