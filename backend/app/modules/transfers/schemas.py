from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TransferenciaLineaCreate(BaseModel):
    activo_id: UUID
    cantidad: int = Field(..., ge=1, le=500)
    ubicacion_origen_id: UUID | None = None


class TransferenciaCreate(BaseModel):
    tipo: Literal["deposito", "persona"] = "deposito"
    deposito_origen_id: UUID
    deposito_destino_id: UUID | None = None
    persona_destino_id: UUID | None = None
    lineas: list[TransferenciaLineaCreate] = Field(default_factory=list, max_length=500)
    activo_ids: list[UUID] = Field(default_factory=list, max_length=500)
    ubicacion_destino_id: UUID | None = None
    notas: str | None = Field(None, max_length=2000)
    epcs: list[str] = Field(
        default_factory=list,
        max_length=5000,
        description="Opcional: verificar EPCs en entrega a persona (un solo paso)",
    )

    @model_validator(mode="after")
    def require_articulos_y_destino(self) -> "TransferenciaCreate":
        if not self.lineas and not self.activo_ids:
            raise ValueError("Seleccioná al menos un artículo")
        if self.tipo == "deposito":
            if self.deposito_destino_id is None:
                raise ValueError("Indicá el depósito destino")
            if self.ubicacion_destino_id is None:
                raise ValueError("Indicá la ubicación destino")
            if self.persona_destino_id is not None:
                raise ValueError("Un movimiento a depósito no admite persona destino")
        elif self.tipo == "persona":
            if self.persona_destino_id is None:
                raise ValueError("Indicá la persona destinataria")
            if self.deposito_destino_id is not None:
                raise ValueError("Un movimiento a persona no admite depósito destino")
            if self.ubicacion_destino_id is not None:
                raise ValueError("Un movimiento a persona no admite ubicación destino")
        return self


class TransferenciaEpcsRequest(BaseModel):
    epcs: list[str] = Field(default_factory=list, max_length=5000)


class TransferenciaConfirmarDestinoRequest(BaseModel):
    epcs: list[str] = Field(default_factory=list, max_length=5000)
    ubicacion_destino_id: UUID | None = None


class DetalleTransferenciaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activo_id: UUID
    etiqueta_id: UUID | None = None
    epc: str | None
    numero_patrimonial: str | None
    descripcion: str | None
    ubicacion_origen_id: UUID | None
    confirmado_origen: bool
    confirmado_destino: bool


class TransferenciaListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tipo: str
    deposito_origen_id: UUID
    deposito_destino_id: UUID | None
    ubicacion_destino_id: UUID | None
    persona_destino_id: UUID | None = None
    persona_destino_nombre: str | None = None
    usuario_id: UUID | None = None
    usuario_nombre: str | None = None
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
    tipo: str
    deposito_origen_id: UUID
    deposito_destino_id: UUID | None
    ubicacion_destino_id: UUID | None
    persona_destino_id: UUID | None = None
    persona_destino_nombre: str | None = None
    usuario_id: UUID | None
    usuario_nombre: str | None = None
    estado: str
    notas: str | None
    total_activos: int
    confirmados_origen: int
    confirmados_destino: int
    creado_en: datetime
    enviado_en: datetime | None
    completado_en: datetime | None
    detalles: list[DetalleTransferenciaResponse] = []
