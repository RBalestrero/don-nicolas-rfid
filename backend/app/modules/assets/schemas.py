from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CategoriaBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    descripcion: str | None = None


class CategoriaCreate(CategoriaBase):
    pass


class CategoriaUpdate(BaseModel):
    nombre: str | None = Field(None, min_length=1, max_length=100)
    descripcion: str | None = None
    activa: bool | None = None


class CategoriaResponse(CategoriaBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activa: bool
    creado_en: datetime
    actualizado_en: datetime


class ActivoBase(BaseModel):
    numero_patrimonial: str = Field(..., min_length=1, max_length=50)
    descripcion: str = Field(..., min_length=1, max_length=255)
    categoria_id: UUID
    epc: str | None = Field(None, max_length=96)
    datos_tecnicos: dict | None = None


class ActivoCreate(ActivoBase):
    pass


class ActivoUpdate(BaseModel):
    numero_patrimonial: str | None = Field(None, min_length=1, max_length=50)
    descripcion: str | None = Field(None, min_length=1, max_length=255)
    categoria_id: UUID | None = None
    epc: str | None = Field(None, max_length=96)
    datos_tecnicos: dict | None = None
    activo: bool | None = None


class ActivoResponse(ActivoBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activo: bool
    creado_en: datetime
    actualizado_en: datetime
    categoria: CategoriaResponse
