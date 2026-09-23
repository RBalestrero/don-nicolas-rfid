from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

EPC_MAX_LEN = 96
EPC_LIST_MAX = 5000


def _normalize_epcs(epcs: list[str]) -> list[str]:
    cleaned: list[str] = []
    for raw in epcs:
        epc = raw.strip().upper()
        if not epc:
            continue
        if len(epc) > EPC_MAX_LEN:
            raise ValueError(f"Cada EPC puede tener como máximo {EPC_MAX_LEN} caracteres")
        cleaned.append(epc)
    return cleaned


class InventarioCreate(BaseModel):
    deposito_id: UUID
    sector_id: UUID | None = None
    ubicacion_id: UUID | None = None
    # Inventario de un solo SKU: solo unidades de este activo en el depósito.
    activo_id: UUID | None = None


class InventarioLecturasRequest(BaseModel):
    epcs: list[str] = Field(default_factory=list, max_length=EPC_LIST_MAX)

    @field_validator("epcs")
    @classmethod
    def validate_epcs(cls, value: list[str]) -> list[str]:
        return _normalize_epcs(value)


class InventarioCerrarRequest(BaseModel):
    epcs: list[str] = Field(default_factory=list, max_length=EPC_LIST_MAX)

    @field_validator("epcs")
    @classmethod
    def validate_epcs(cls, value: list[str]) -> list[str]:
        return _normalize_epcs(value)


class InventarioAuditarRequest(BaseModel):
    """Confirma o actualiza la auditoría de un inventario cerrado (web)."""

    comentario: str | None = Field(None, max_length=2000)
    auditado: bool = True

    @field_validator("comentario")
    @classmethod
    def normalize_comentario(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InventarioDescartarRequest(BaseModel):
    """Rechaza un inventario cerrado inválido sin aplicar ajuste de stock."""

    comentario: str = Field(..., min_length=1, max_length=2000)

    @field_validator("comentario")
    @classmethod
    def normalize_comentario(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El comentario es obligatorio para descartar")
        return cleaned


class DetalleInventarioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activo_id: UUID | None
    epc: str | None
    numero_patrimonial: str | None
    descripcion: str | None
    estado: str
    leido_en: datetime | None
    # Enriquecidos desde Etiqueta/Activo al serializar (no columnas de detalle).
    serie_fisica: str | None = None
    serializado: bool | None = None


class InventarioResumen(BaseModel):
    total_esperado: int
    total_encontrado: int
    total_faltante: int
    total_sobrante: int
    total_exceso: int = 0
    sin_epc: int = 0


class InventarioListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    deposito_id: UUID
    sector_id: UUID | None
    ubicacion_id: UUID | None
    estado: str
    total_esperado: int
    total_encontrado: int
    total_faltante: int
    total_sobrante: int
    total_exceso: int = 0
    iniciado_en: datetime
    cerrado_en: datetime | None
    auditado: bool = False
    auditado_en: datetime | None = None
    auditado_por_id: UUID | None = None
    comentario_auditoria: str | None = None
    ajuste_aplicado: bool = False


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
    total_exceso: int = 0
    iniciado_en: datetime
    cerrado_en: datetime | None
    auditado: bool = False
    auditado_en: datetime | None = None
    auditado_por_id: UUID | None = None
    comentario_auditoria: str | None = None
    ajuste_aplicado: bool = False
    resumen: InventarioResumen
    detalles: list[DetalleInventarioResponse] = []


class InventarioReporteResponse(BaseModel):
    inventario_id: UUID
    deposito_id: UUID
    estado: str
    iniciado_en: datetime
    cerrado_en: datetime | None
    auditado: bool = False
    auditado_en: datetime | None = None
    auditado_por_id: UUID | None = None
    comentario_auditoria: str | None = None
    ajuste_aplicado: bool = False
    resumen: InventarioResumen
    coincidencia_pct: float
    tiene_discrepancias: bool
    encontrados: list[DetalleInventarioResponse]
    faltantes: list[DetalleInventarioResponse]
    excesos: list[DetalleInventarioResponse] = []
    ajenos: list[DetalleInventarioResponse] = []
    sobrantes: list[DetalleInventarioResponse]
    sin_epc: list[DetalleInventarioResponse] = []
