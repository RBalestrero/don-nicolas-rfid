import uuid

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, joinedload

from app.modules.warehouses.models import Sector, Ubicacion

from app.modules.assets.models import Activo, Categoria, Etiqueta


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
        self.db.delete(categoria)
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
            .options(
                joinedload(Activo.categoria),
                joinedload(Activo.ubicacion)
                .joinedload(Ubicacion.sector)
                .joinedload(Sector.deposito),
            )
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
                    exists().where(
                        Etiqueta.activo_id == Activo.id,
                        Etiqueta.epc.ilike(pattern),
                        Etiqueta.estado == "activa",
                    ),
                    exists().where(
                        Etiqueta.activo_id == Activo.id,
                        Etiqueta.serie_fisica.ilike(pattern),
                    ),
                )
            )
        return list(self.db.scalars(stmt).unique().all())

    def get_by_id(self, activo_id: uuid.UUID) -> Activo | None:
        stmt = (
            select(Activo)
            .options(
                joinedload(Activo.categoria),
                joinedload(Activo.ubicacion)
                .joinedload(Ubicacion.sector)
                .joinedload(Sector.deposito),
            )
            .where(Activo.id == activo_id)
        )
        return self.db.scalars(stmt).unique().first()

    def get_by_numero_patrimonial(self, numero: str) -> Activo | None:
        return self.db.scalars(
            select(Activo).where(Activo.numero_patrimonial == numero)
        ).first()

    def get_by_epc(self, epc: str) -> Activo | None:
        """Resuelve artículo por EPC de etiqueta (o legado en activos.epc)."""
        normalized = (epc or "").strip().upper()
        if not normalized:
            return None

        etiqueta = self.db.scalars(
            select(Etiqueta)
            .options(joinedload(Etiqueta.activo).joinedload(Activo.categoria))
            .where(Etiqueta.epc == normalized, Etiqueta.estado == "activa")
        ).first()
        if etiqueta and etiqueta.activo and etiqueta.activo.activo:
            return etiqueta.activo

        stmt = (
            select(Activo)
            .options(joinedload(Activo.categoria))
            .where(Activo.epc.ilike(normalized))
        )
        return self.db.scalars(stmt).first()

    def get_by_epcs(self, epcs: list[str]) -> dict[str, Activo]:
        """Resuelve varios EPCs → Activo (etiqueta activa o legado)."""
        normalized = []
        seen: set[str] = set()
        for raw in epcs:
            epc = (raw or "").strip().upper()
            if not epc or epc in seen:
                continue
            seen.add(epc)
            normalized.append(epc)
        if not normalized:
            return {}

        found: dict[str, Activo] = {}
        etiquetas = self.db.scalars(
            select(Etiqueta)
            .options(joinedload(Etiqueta.activo).joinedload(Activo.categoria))
            .where(Etiqueta.epc.in_(normalized), Etiqueta.estado == "activa")
        ).unique().all()
        for etiqueta in etiquetas:
            activo = etiqueta.activo
            if activo is not None and activo.activo:
                found[etiqueta.epc.upper()] = activo

        missing = [e for e in normalized if e not in found]
        if missing:
            legacy = self.db.scalars(
                select(Activo)
                .options(joinedload(Activo.categoria))
                .where(Activo.epc.in_(missing), Activo.activo.is_(True))
            ).unique().all()
            for activo in legacy:
                key = (activo.epc or "").strip().upper()
                if key and key not in found:
                    found[key] = activo

        return found

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
        self.db.delete(activo)
        self.db.commit()


class EtiquetaRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, etiqueta_id: uuid.UUID) -> Etiqueta | None:
        stmt = (
            select(Etiqueta)
            .options(joinedload(Etiqueta.activo).joinedload(Activo.categoria))
            .where(Etiqueta.id == etiqueta_id)
        )
        return self.db.scalars(stmt).first()

    def get_by_epc(self, epc: str) -> Etiqueta | None:
        normalized = (epc or "").strip().upper()
        if not normalized:
            return None
        return self.db.scalars(
            select(Etiqueta)
            .options(joinedload(Etiqueta.activo).joinedload(Activo.categoria))
            .where(Etiqueta.epc == normalized)
        ).first()

    def get_by_serie_fisica(self, serie: str) -> Etiqueta | None:
        """Busca etiqueta activa por serie de fábrica (exacta, case-insensitive)."""
        normalized = (serie or "").strip().upper()
        if not normalized:
            return None
        return self.db.scalars(
            select(Etiqueta)
            .options(joinedload(Etiqueta.activo).joinedload(Activo.categoria))
            .where(
                Etiqueta.serie_fisica == normalized,
                Etiqueta.estado == "activa",
            )
            .order_by(Etiqueta.creado_en.desc())
        ).first()

    def list(
        self,
        *,
        activo_id: uuid.UUID | None = None,
        search: str | None = None,
        solo_activas: bool = True,
        limit: int = 500,
    ) -> list[Etiqueta]:
        stmt = (
            select(Etiqueta)
            .options(joinedload(Etiqueta.activo).joinedload(Activo.categoria))
            .order_by(Etiqueta.creado_en.desc())
            .limit(limit)
        )
        if solo_activas:
            stmt = stmt.where(Etiqueta.estado == "activa")
        if activo_id:
            stmt = stmt.where(Etiqueta.activo_id == activo_id)
        if search:
            pattern = f"%{search.strip()}%"
            stmt = stmt.join(Activo, Etiqueta.activo_id == Activo.id).where(
                or_(
                    Etiqueta.epc.ilike(pattern),
                    Etiqueta.serie_fisica.ilike(pattern),
                    Activo.numero_patrimonial.ilike(pattern),
                    Activo.descripcion.ilike(pattern),
                )
            )
        return list(self.db.scalars(stmt).unique().all())

    def count_activas_by_activo(self, activo_id: uuid.UUID) -> int:
        from sqlalchemy import func

        return int(
            self.db.scalar(
                select(func.count())
                .select_from(Etiqueta)
                .where(Etiqueta.activo_id == activo_id, Etiqueta.estado == "activa")
            )
            or 0
        )

    def counts_activas(self, activo_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        if not activo_ids:
            return {}
        from sqlalchemy import func

        rows = self.db.execute(
            select(Etiqueta.activo_id, func.count())
            .where(Etiqueta.activo_id.in_(activo_ids), Etiqueta.estado == "activa")
            .group_by(Etiqueta.activo_id)
        ).all()
        return {row[0]: int(row[1]) for row in rows}

    def list_activas_by_activo_ids(self, activo_ids: list[uuid.UUID]) -> list[Etiqueta]:
        if not activo_ids:
            return []
        return list(
            self.db.scalars(
                select(Etiqueta).where(
                    Etiqueta.activo_id.in_(activo_ids),
                    Etiqueta.estado == "activa",
                )
            ).all()
        )

    def epc_exists(self, epc: str) -> bool:
        normalized = (epc or "").strip().upper()
        if not normalized:
            return False
        if self.get_by_epc(normalized):
            return True
        return (
            self.db.scalars(select(Activo.id).where(Activo.epc == normalized)).first()
            is not None
        )

    def add_many(self, etiquetas: list[Etiqueta]) -> list[Etiqueta]:
        """Agrega etiquetas y hace flush (sin commit) para IDs/unique check en la misma TX."""
        self.db.add_all(etiquetas)
        self.db.flush()
        return etiquetas

    def create_many(self, etiquetas: list[Etiqueta]) -> list[Etiqueta]:
        """Compat: add + commit. Preferir add_many + commit explícito en el servicio."""
        self.add_many(etiquetas)
        self.db.commit()
        for e in etiquetas:
            self.db.refresh(e)
        return etiquetas

    def update(self, etiqueta: Etiqueta) -> Etiqueta:
        self.db.commit()
        self.db.refresh(etiqueta)
        return etiqueta
