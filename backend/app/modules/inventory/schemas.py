from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class InventarioCreate(BaseModel):
    deposito_id: UUID
    sector_id: UUID | None = None
    ubicacion_id: UUID | None = None


class InventarioLecturasRequest(BaseModel):
    epcs: list[str] = Field(default_factory=list, max_length=5000)


class InventarioCerrarRequest(BaseModel):
    epcs: list[str] = Field(default_factory=list, max_length=5000)


class DetalleInventarioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activo_id: UUID | None
    epc: str | None
    numero_patrimonial: str | None
    descripcion: str | None
    estado: str
    leido_en: datetime | None


class InventarioResumen(BaseModel):
    total_esperado: int
    total_encontrado: int
    total_faltante: int
    total_sobrante: int
    sin_epc: int = 0


class InventarioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    deposito_id: UUID
    sector_id: UUID | None
    ubicacion_id: UUID | None
    usuario_id: UUID | None
    estado: str
    total_esperado: int
    total_encontrado: int
    total_faltante: int
    total_sobrante: int
    iniciado_en: datetime
    cerrado_en: datetime | None
    resumen: InventarioResumen
    detalles: list[DetalleInventarioResponse] = []
