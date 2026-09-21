from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.integrations.zebra.epc_generator import normalizar_epc, pertenece_al_sistema


def _validar_epc_del_sistema(value: str | None) -> str | None:
    """Rechaza EPCs ajenos al esquema D1 en el alta/edición de artículos.

    La APK del MC33 filtra por prefijo D1 al leer, así que una etiqueta con otro
    esquema nunca se reportaría como encontrada: el inventario la daría por
    faltante y el cierre la marcaría perdida quitándole la ubicación al activo.
    """
    if value is None:
        return None
    epc = normalizar_epc(value)
    if not epc:
        return None
    if not pertenece_al_sistema(epc):
        raise ValueError(
            "El EPC debe pertenecer al esquema Don Nicolás (24 hexadecimales con "
            "prefijo D1). El MC33 no lee etiquetas de otros esquemas."
        )
    return epc


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
    # Solo lectura en responses; en create/update se ignora/rechaza (fuente: etiquetas).
    epc: str | None = Field(None, max_length=96)
    datos_tecnicos: dict | None = None
    # Cada unidad RFID pedirá número de serie de fábrica al imprimir/codificar.
    serializado: bool = False


class ActivoCreate(ActivoBase):
    """Alta de artículo. EPC se genera al crear etiquetas RFID (no en el alta)."""

    ubicacion_id: UUID | None = None

    _normalize_epc = field_validator("epc")(_validar_epc_del_sistema)


class ActivoUpdate(BaseModel):
    numero_patrimonial: str | None = Field(None, min_length=1, max_length=50)
    descripcion: str | None = Field(None, min_length=1, max_length=255)
    categoria_id: UUID | None = None
    # Compat: si se envía, se crea una Etiqueta (no se escribe activos.epc).
    epc: str | None = Field(None, max_length=96)
    datos_tecnicos: dict | None = None
    activo: bool | None = None
    serializado: bool | None = None

    _normalize_epc = field_validator("epc")(_validar_epc_del_sistema)


class ActivoUbicacionResumen(BaseModel):
    ubicacion_id: UUID
    ubicacion_codigo: str
    sector_id: UUID
    sector_nombre: str
    deposito_id: UUID
    deposito_nombre: str


class ActivoResponse(ActivoBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activo: bool
    creado_en: datetime
    actualizado_en: datetime
    categoria: CategoriaResponse
    stock_etiquetas: int = 0
    # EPCs de etiquetas activas (unidades). `epc` queda como representativo (primero / legado).
    epcs: list[str] = Field(default_factory=list)
    # Resumen de ubicación actual (join en listado; evita N+1 en la web).
    ubicacion: ActivoUbicacionResumen | None = None


class ActivoLookupResponse(BaseModel):
    encontrado: bool
    epc_consultado: str
    activo: ActivoResponse | None = None
    ubicacion: ActivoUbicacionResumen | None = None
    mensaje: str | None = None


class ActivoLookupEpcsRequest(BaseModel):
    epcs: list[str] = Field(default_factory=list, max_length=1000)

    @field_validator("epcs")
    @classmethod
    def _cap_epcs(cls, value: list[str]) -> list[str]:
        # Normalización/dedupe en el service; acá solo acotamos tamaño.
        if len(value) > 1000:
            raise ValueError("Máximo 1000 EPCs por consulta")
        return value


class ActivoLookupEpcsResponse(BaseModel):
    consultados: int
    encontrados: list[ActivoLookupResponse]
    no_registrados: list[str] = Field(default_factory=list)


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


class ObservacionCreate(BaseModel):
    texto: str = Field(..., min_length=1, max_length=4000)

    @field_validator("texto")
    @classmethod
    def texto_no_vacio(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El texto de la observación no puede estar vacío")
        if len(cleaned) > 4000:
            raise ValueError("El texto no puede superar 4000 caracteres")
        return cleaned


class ObservacionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activo_id: UUID
    usuario_id: UUID | None
    usuario_nombre: str | None = None
    texto: str
    creado_en: datetime


class EpcDecodedInfo(BaseModel):
    epc: str
    scheme: str | None = None
    articulo_code: int | None = None
    articulo_sugerido: str | None = None
    serial: int | None = None
    serial_hex: str | None = None
    system_suffix: str | None = None
    del_sistema: bool = False
    valido: bool
    mensaje: str


class EtiquetaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activo_id: UUID
    epc: str
    serial_hex: str | None = None
    serie_fisica: str | None = None
    estado: str
    impresa: bool
    creado_en: datetime
    impresa_en: datetime | None = None
    numero_patrimonial: str | None = None
    descripcion: str | None = None
    decodificado: EpcDecodedInfo | None = None


class EtiquetaLoteRequest(BaseModel):
    """Alta o reimpresión de N unidades RFID para un artículo (SKU)."""

    cantidad: int = Field(1, ge=1, le=50)
    modo: Literal["nueva", "reposicion"] = Field(
        "nueva",
        description="nueva: crea EPCs y suma stock. reposicion: reimprime existentes sin sumar stock.",
    )
    # Obligatorio si el artículo está serializado y modo=nueva (1 por unidad).
    series_fisicas: list[str] | None = Field(
        None,
        description="Números de serie de fábrica, uno por etiqueta nueva.",
    )


class EtiquetaLoteItem(BaseModel):
    id: UUID
    epc: str
    serial_hex: str | None = None
    serie_fisica: str | None = None
    decodificado: EpcDecodedInfo


class ActivoLookupSerieResponse(BaseModel):
    encontrado: bool
    serie_consultada: str
    activo: ActivoResponse | None = None
    etiqueta_id: UUID | None = None
    epc: str | None = None
    ubicacion: ActivoUbicacionResumen | None = None
    mensaje: str | None = None


class EtiquetaLoteResponse(BaseModel):
    activo_id: UUID
    numero_patrimonial: str
    descripcion: str
    cantidad: int
    stock_etiquetas: int
    etiquetas: list[EtiquetaLoteItem]
    impreso: bool
    modo_simulacion: bool
    zpl: str | None = None


# Compat: endpoints legacy de una sola etiqueta
class EtiquetaImpresionRequest(BaseModel):
    copias: int = Field(1, ge=1, le=50)


class EtiquetaCodificacionRequest(BaseModel):
    """Legacy: siempre crea unidades nuevas (1:N). `regenerar` solo refleja la intención."""

    regenerar: bool = Field(
        False,
        description="Legacy. True indica que se pidió una unidad adicional; no reemplaza EPCs.",
    )
    cantidad: int = Field(1, ge=1, le=50)


class EtiquetaCodificacionResponse(BaseModel):
    activo_id: UUID
    numero_patrimonial: str
    descripcion: str
    epc: str
    epc_asignado: bool
    regenerado: bool
    decodificado: EpcDecodedInfo
    stock_etiquetas: int = 0


class EtiquetaImpresionResponse(BaseModel):
    activo_id: UUID
    numero_patrimonial: str
    descripcion: str
    epc: str
    epc_asignado: bool
    impreso: bool
    modo_simulacion: bool
    zpl: str | None = None
    decodificado: EpcDecodedInfo | None = None
    stock_etiquetas: int = 0
    cantidad: int = 1
    etiquetas: list[EtiquetaLoteItem] | None = None
