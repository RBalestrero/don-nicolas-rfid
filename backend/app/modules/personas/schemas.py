from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PersonaCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)
    documento: str | None = Field(None, max_length=40)


class PersonaUpdate(BaseModel):
    nombre: str | None = Field(None, min_length=1, max_length=150)
    documento: str | None = Field(None, max_length=40)
    activo: bool | None = None


class PersonaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nombre: str
    documento: str | None
    activo: bool
    creado_en: datetime
    actualizado_en: datetime
