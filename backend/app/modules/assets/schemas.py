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


class ActivoUbicacionResumen(BaseModel):
    ubicacion_id: UUID
    ubicacion_codigo: str
    sector_id: UUID
    sector_nombre: str
    deposito_id: UUID
    deposito_nombre: str


class ActivoLookupResponse(BaseModel):
    encontrado: bool
    epc_consultado: str
    activo: ActivoResponse | None = None
    ubicacion: ActivoUbicacionResumen | None = None
    mensaje: str | None = None


class FotografiaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activo_id: UUID
    nombre_archivo: str
    mime_type: str
    tamano_bytes: int
    es_principal: bool
    creado_en: datetime
    url: str


class HistorialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activo_id: UUID
    usuario_id: UUID | None
    usuario_nombre: str | None = None
    accion: str
    cambios: dict | None
    creado_en: datetime


class EtiquetaImpresionRequest(BaseModel):
    copias: int = Field(1, ge=1, le=10)


class EtiquetaImpresionResponse(BaseModel):
    activo_id: UUID
    numero_patrimonial: str
    descripcion: str
    epc: str
    epc_asignado: bool
    impreso: bool
    modo_simulacion: bool
    zpl: str | None = None
