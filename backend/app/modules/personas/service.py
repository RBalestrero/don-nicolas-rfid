import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.personas.models import Persona
from app.modules.personas.schemas import PersonaCreate, PersonaResponse, PersonaUpdate


class PersonasService:
    def __init__(self, db: Session):
        self.db = db

    def list_personas(
        self,
        *,
        q: str | None = None,
        solo_activos: bool = True,
        limit: int = 100,
    ) -> list[PersonaResponse]:
        stmt = select(Persona).order_by(Persona.nombre.asc()).limit(min(max(limit, 1), 500))
        if solo_activos:
            stmt = stmt.where(Persona.activo.is_(True))
        if q and q.strip():
            term = f"%{q.strip()}%"
            stmt = stmt.where(
                Persona.nombre.ilike(term) | Persona.documento.ilike(term)
            )
        return [PersonaResponse.model_validate(p) for p in self.db.scalars(stmt).all()]

    def get(self, persona_id: uuid.UUID) -> PersonaResponse:
        return PersonaResponse.model_validate(self._get_or_404(persona_id))

    def create(self, data: PersonaCreate) -> PersonaResponse:
        nombre = data.nombre.strip()
        if not nombre:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre es obligatorio"
            )
        documento = data.documento.strip() if data.documento else None
        persona = Persona(nombre=nombre, documento=documento or None, activo=True)
        self.db.add(persona)
        self.db.commit()
        self.db.refresh(persona)
        return PersonaResponse.model_validate(persona)

    def update(self, persona_id: uuid.UUID, data: PersonaUpdate) -> PersonaResponse:
        persona = self._get_or_404(persona_id)
        if data.nombre is not None:
            nombre = data.nombre.strip()
            if not nombre:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre es obligatorio"
                )
            persona.nombre = nombre
        if data.documento is not None:
            doc = data.documento.strip()
            persona.documento = doc or None
        if data.activo is not None:
            persona.activo = data.activo
        self.db.commit()
        self.db.refresh(persona)
        return PersonaResponse.model_validate(persona)

    def _get_or_404(self, persona_id: uuid.UUID) -> Persona:
        persona = self.db.get(Persona, persona_id)
        if not persona:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Persona no encontrada"
            )
        return persona

    def get_activa(self, persona_id: uuid.UUID) -> Persona:
        persona = self._get_or_404(persona_id)
        if not persona.activo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La persona destinataria está inactiva",
            )
        return persona
