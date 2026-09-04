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


class AsignacionUbicacionRequest(BaseModel):
    ubicacion_id: UUID


class UbicacionAsignadaResponse(BaseModel):
    activo_id: UUID
    ubicacion_id: UUID
    ubicacion_codigo: str
    sector_id: UUID
    sector_nombre: str
    deposito_id: UUID
    deposito_nombre: str


class StockActivoItem(BaseModel):
    activo_id: UUID
    numero_patrimonial: str
    descripcion: str
    categoria_nombre: str
    epc: str | None


class StockUbicacionResponse(BaseModel):
    ubicacion_id: UUID
    ubicacion_codigo: str
    sector_id: UUID
    sector_nombre: str
    deposito_id: UUID
    deposito_nombre: str
    total: int
    activos: list[StockActivoItem]


class StockActivoDetalle(StockActivoItem):
    categoria_id: UUID
    ubicacion_id: UUID
    ubicacion_codigo: str
    sector_id: UUID
    sector_nombre: str


class StockResumenSector(BaseModel):
    sector_id: UUID
    sector_nombre: str
    total: int
    ubicaciones: int


class StockDepositoResponse(BaseModel):
    deposito_id: UUID
    deposito_nombre: str
    total: int
    filtros: dict
    por_sector: list[StockResumenSector]
    activos: list[StockActivoDetalle]
