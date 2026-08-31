from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DepositoBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    descripcion: str | None = None
    direccion: str | None = Field(None, max_length=255)


class DepositoCreate(DepositoBase):
    pass


class DepositoUpdate(BaseModel):
    nombre: str | None = Field(None, min_length=1, max_length=100)
    descripcion: str | None = None
    direccion: str | None = Field(None, max_length=255)
    activo: bool | None = None


class DepositoResponse(DepositoBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activo: bool
    creado_en: datetime
    actualizado_en: datetime


class SectorBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    descripcion: str | None = None


class SectorCreate(SectorBase):
    pass


class SectorUpdate(BaseModel):
    nombre: str | None = Field(None, min_length=1, max_length=100)
    descripcion: str | None = None
    activo: bool | None = None


class SectorResponse(SectorBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    deposito_id: UUID
    activo: bool
    creado_en: datetime
    actualizado_en: datetime


class UbicacionBase(BaseModel):
    codigo: str = Field(..., min_length=1, max_length=50)
    descripcion: str | None = None


class UbicacionCreate(UbicacionBase):
    pass


class UbicacionUpdate(BaseModel):
    codigo: str | None = Field(None, min_length=1, max_length=50)
    descripcion: str | None = None
    activo: bool | None = None


class UbicacionResponse(UbicacionBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sector_id: UUID
    activo: bool
    creado_en: datetime
    actualizado_en: datetime


class DepositoDetalleResponse(DepositoResponse):
    sectores: list["SectorDetalleResponse"] = []


class SectorDetalleResponse(SectorResponse):
    ubicaciones: list[UbicacionResponse] = []
