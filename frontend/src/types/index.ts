export interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface Activo {
  id: string;
  numero_patrimonial: string;
  descripcion: string;
  categoria_id: string;
  epc: string | null;
  datos_tecnicos: Record<string, unknown> | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
  categoria: Categoria;
}

export interface User {
  id: string;
  email: string;
  nombre: string;
  rol: string;
}

export interface ActivoCreatePayload {
  numero_patrimonial: string;
  descripcion: string;
  categoria_id: string;
  epc?: string | null;
  datos_tecnicos?: Record<string, unknown> | null;
}

export interface CategoriaCreatePayload {
  nombre: string;
  descripcion?: string | null;
}

export interface Deposito {
  id: string;
  nombre: string;
  descripcion: string | null;
  direccion: string | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface Sector {
  id: string;
  deposito_id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface Ubicacion {
  id: string;
  sector_id: string;
  codigo: string;
  descripcion: string | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface SectorDetalle extends Sector {
  ubicaciones: Ubicacion[];
}

export interface DepositoDetalle extends Deposito {
  sectores: SectorDetalle[];
}

export interface DepositoCreatePayload {
  nombre: string;
  descripcion?: string | null;
  direccion?: string | null;
}

export interface SectorCreatePayload {
  nombre: string;
  descripcion?: string | null;
}

export interface UbicacionCreatePayload {
  codigo: string;
  descripcion?: string | null;
}

export interface StockActivoDetalle {
  activo_id: string;
  numero_patrimonial: string;
  descripcion: string;
  categoria_id: string;
  categoria_nombre: string;
  epc: string | null;
  ubicacion_id: string;
  ubicacion_codigo: string;
  sector_id: string;
  sector_nombre: string;
}

export interface StockDeposito {
  deposito_id: string;
  deposito_nombre: string;
  total: number;
  activos: StockActivoDetalle[];
}

export interface UbicacionAsignada {
  activo_id: string;
  ubicacion_id: string;
  ubicacion_codigo: string;
  sector_id: string;
  sector_nombre: string;
  deposito_id: string;
  deposito_nombre: string;
}

export interface AsignacionUbicacionPayload {
  ubicacion_id: string;
}

export interface InventarioCreatePayload {
  deposito_id: string;
  sector_id?: string | null;
  ubicacion_id?: string | null;
}

export interface InventarioResumen {
  total_esperado: number;
  total_encontrado: number;
  total_faltante: number;
  total_sobrante: number;
  sin_epc: number;
}

export interface DetalleInventario {
  id: string;
  activo_id: string | null;
  epc: string | null;
  numero_patrimonial: string | null;
  descripcion: string | null;
  estado: string;
  leido_en: string | null;
}

export interface InventarioListItem {
  id: string;
  deposito_id: string;
  sector_id: string | null;
  ubicacion_id: string | null;
  estado: string;
  total_esperado: number;
  total_encontrado: number;
  total_faltante: number;
  total_sobrante: number;
  iniciado_en: string;
  cerrado_en: string | null;
}

export interface Inventario {
  id: string;
  deposito_id: string;
  sector_id: string | null;
  ubicacion_id: string | null;
  usuario_id: string | null;
  estado: string;
  total_esperado: number;
  total_encontrado: number;
  total_faltante: number;
  total_sobrante: number;
  iniciado_en: string;
  cerrado_en: string | null;
  resumen: InventarioResumen;
  detalles: DetalleInventario[];
}

export interface InventarioReporte {
  inventario_id: string;
  deposito_id: string;
  estado: string;
  iniciado_en: string;
  cerrado_en: string | null;
  resumen: InventarioResumen;
  coincidencia_pct: number;
  tiene_discrepancias: boolean;
  encontrados: DetalleInventario[];
  faltantes: DetalleInventario[];
  sobrantes: DetalleInventario[];
  sin_epc: DetalleInventario[];
}
