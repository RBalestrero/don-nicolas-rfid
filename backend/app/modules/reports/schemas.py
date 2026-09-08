from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MovimientoItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activo_id: UUID
    numero_patrimonial: str | None = None
    descripcion: str | None = None
    usuario_id: UUID | None = None
    usuario_nombre: str | None = None
    accion: str
    cambios: dict | None = None
    creado_en: datetime


class MovimientosPage(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[MovimientoItem]


class DiscrepanciasKpi(BaseModel):
    faltantes: int
    sobrantes: int
    inventarios_con_discrepancia: int


class DashboardKpis(BaseModel):
    activos_activos: int
    depositos_activos: int
    inventarios_abiertos: int
    transferencias_abiertas: int
    stock_total_ubicado: int
    discrepancias_inventarios_cerrados: DiscrepanciasKpi


class StockDepositoResumen(BaseModel):
    deposito_id: UUID
    deposito_nombre: str
    total: int


class TransferenciaResumen(BaseModel):
    id: UUID
    deposito_origen_id: UUID
    deposito_origen_nombre: str | None = None
    deposito_destino_id: UUID
    deposito_destino_nombre: str | None = None
    estado: str
    total_activos: int
    confirmados_origen: int
    confirmados_destino: int
    creado_en: datetime


class InventarioResumenItem(BaseModel):
    id: UUID
    deposito_id: UUID
    deposito_nombre: str | None = None
    estado: str
    total_esperado: int
    total_encontrado: int
    total_faltante: int
    total_sobrante: int
    iniciado_en: datetime
    cerrado_en: datetime | None = None


class DashboardResumen(BaseModel):
    kpis: DashboardKpis
    stock_por_deposito: list[StockDepositoResumen]
    movimientos_recientes: list[MovimientoItem]
    transferencias_recientes: list[TransferenciaResumen]
    inventarios_recientes: list[InventarioResumenItem]
    movimientos_limit: int = Field(ge=1)
    ops_limit: int = Field(ge=1)
