from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TransferenciaCreate(BaseModel):
    deposito_origen_id: UUID
    deposito_destino_id: UUID
    activo_ids: list[UUID] = Field(..., min_length=1, max_length=500)
    ubicacion_destino_id: UUID | None = None
    notas: str | None = Field(None, max_length=2000)


class TransferenciaEpcsRequest(BaseModel):
    epcs: list[str] = Field(default_factory=list, max_length=5000)


class TransferenciaConfirmarDestinoRequest(BaseModel):
    epcs: list[str] = Field(default_factory=list, max_length=5000)
    ubicacion_destino_id: UUID | None = None


class DetalleTransferenciaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activo_id: UUID
    epc: str | None
    numero_patrimonial: str | None
    descripcion: str | None
    ubicacion_origen_id: UUID | None
    confirmado_origen: bool
    confirmado_destino: bool


class TransferenciaListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    deposito_origen_id: UUID
    deposito_destino_id: UUID
    ubicacion_destino_id: UUID | None
    estado: str
    total_activos: int
    confirmados_origen: int
    confirmados_destino: int
    creado_en: datetime
    enviado_en: datetime | None
    completado_en: datetime | None


class TransferenciaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    deposito_origen_id: UUID
    deposito_destino_id: UUID
    ubicacion_destino_id: UUID | None
    usuario_id: UUID | None
    estado: str
    notas: str | None
    total_activos: int
    confirmados_origen: int
    confirmados_destino: int
    creado_en: datetime
    enviado_en: datetime | None
    completado_en: datetime | None
    detalles: list[DetalleTransferenciaResponse] = []
