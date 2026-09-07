import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.modules.assets.models import Activo, Categoria


class CategoriaRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self, include_inactive: bool = False) -> list[Categoria]:
        stmt = select(Categoria).order_by(Categoria.nombre)
        if not include_inactive:
            stmt = stmt.where(Categoria.activa.is_(True))
        return list(self.db.scalars(stmt).all())

    def get_by_id(self, categoria_id: uuid.UUID) -> Categoria | None:
        return self.db.get(Categoria, categoria_id)

    def get_by_nombre(self, nombre: str) -> Categoria | None:
        return self.db.scalars(select(Categoria).where(Categoria.nombre == nombre)).first()

    def create(self, categoria: Categoria) -> Categoria:
        self.db.add(categoria)
        self.db.commit()
        self.db.refresh(categoria)
        return categoria

    def update(self, categoria: Categoria) -> Categoria:
        self.db.commit()
        self.db.refresh(categoria)
        return categoria

    def delete(self, categoria: Categoria) -> None:
        categoria.activa = False
        self.db.commit()


class ActivoRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(
        self,
        categoria_id: uuid.UUID | None = None,
        search: str | None = None,
        include_inactive: bool = False,
    ) -> list[Activo]:
        stmt = (
            select(Activo)
            .options(joinedload(Activo.categoria))
            .order_by(Activo.numero_patrimonial)
        )
        if not include_inactive:
            stmt = stmt.where(Activo.activo.is_(True))
        if categoria_id:
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
        return list(self.db.scalars(stmt).unique().all())

    def get_by_id(self, activo_id: uuid.UUID) -> Activo | None:
        stmt = (
            select(Activo)
            .options(joinedload(Activo.categoria))
            .where(Activo.id == activo_id)
        )
        return self.db.scalars(stmt).first()

    def get_by_numero_patrimonial(self, numero: str) -> Activo | None:
        return self.db.scalars(
            select(Activo).where(Activo.numero_patrimonial == numero)
        ).first()

    def get_by_epc(self, epc: str) -> Activo | None:
        normalized = (epc or "").strip().upper()
        if not normalized:
            return None
        stmt = (
            select(Activo)
            .options(joinedload(Activo.categoria))
            .where(Activo.epc.ilike(normalized))
        )
        return self.db.scalars(stmt).first()

    def create(self, activo: Activo) -> Activo:
        self.db.add(activo)
        self.db.commit()
        self.db.refresh(activo)
        return self.get_by_id(activo.id)  # type: ignore[return-value]

    def update(self, activo: Activo) -> Activo:
        self.db.commit()
        self.db.refresh(activo)
        return self.get_by_id(activo.id)  # type: ignore[return-value]

    def delete(self, activo: Activo) -> None:
        activo.activo = False
        self.db.commit()
