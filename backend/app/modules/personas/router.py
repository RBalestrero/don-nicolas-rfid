import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.rbac import require_transfer_write
from app.database import get_db
from app.dependencies import get_current_user
from app.modules.auth.models import Usuario
from app.modules.personas.schemas import PersonaCreate, PersonaResponse, PersonaUpdate
from app.modules.personas.service import PersonasService

router = APIRouter(prefix="/personas", tags=["Personas"])


@router.get("", response_model=list[PersonaResponse])
def list_personas(
    q: str | None = Query(None, description="Buscar por nombre o documento"),
    solo_activos: bool = Query(True),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return PersonasService(db).list_personas(q=q, solo_activos=solo_activos, limit=limit)


@router.post("", response_model=PersonaResponse, status_code=status.HTTP_201_CREATED)
def create_persona(
    data: PersonaCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_transfer_write),
):
    return PersonasService(db).create(data)


@router.get("/{persona_id}", response_model=PersonaResponse)
def get_persona(
    persona_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return PersonasService(db).get(persona_id)


@router.patch("/{persona_id}", response_model=PersonaResponse)
def update_persona(
    persona_id: uuid.UUID,
    data: PersonaUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_transfer_write),
):
    return PersonasService(db).update(persona_id, data)
