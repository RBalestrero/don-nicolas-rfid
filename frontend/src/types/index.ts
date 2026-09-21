export interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface ActivoUbicacionResumen {
  ubicacion_id: string;
  ubicacion_codigo: string;
  sector_id: string;
  sector_nombre: string;
  deposito_id: string;
  deposito_nombre: string;
}

export interface Activo {
  id: string;
  numero_patrimonial: string;
  descripcion: string;
  categoria_id: string;
  epc: string | null;
  datos_tecnicos: Record<string, unknown> | null;
  activo: boolean;
  /** Si true, cada etiqueta nueva exige serie de fábrica. */
  serializado?: boolean;
  creado_en: string;
  actualizado_en: string;
  categoria: Categoria;
  stock_etiquetas?: number;
  epcs?: string[];
  /** Resumen incluido en listado/detalle (evita N+1 de /ubicacion). */
  ubicacion?: ActivoUbicacionResumen | null;
}

export interface User {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  permisos?: string[];
}

export interface RolCatalogo {
  id: string;
  nombre: string;
  descripcion: string | null;
  es_sistema?: boolean;
  permisos?: string[];
  usuarios_count?: number;
}

export interface PermisoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  modulo: string;
}

export interface UsuarioAdmin {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  rol_id: string;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface UsuarioCreatePayload {
  email: string;
  nombre: string;
  password: string;
  rol: string;
  activo?: boolean;
}

export interface UsuarioUpdatePayload {
  email?: string;
  nombre?: string;
  password?: string;
  rol?: string;
  activo?: boolean;
}

export interface RolCreatePayload {
  nombre: string;
  descripcion?: string | null;
  permisos: string[];
}

export interface RolUpdatePayload {
  nombre?: string;
  descripcion?: string | null;
  permisos?: string[];
}

export interface ActivoCreatePayload {
  numero_patrimonial: string;
  descripcion: string;
  categoria_id: string;
  epc?: string | null;
  datos_tecnicos?: Record<string, unknown> | null;
  /** Obligatoria en el alta desde la web. */
  ubicacion_id?: string | null;
  serializado?: boolean;
}

export interface ActivoUpdatePayload {
  numero_patrimonial?: string;
  descripcion?: string;
  categoria_id?: string;
  epc?: string | null;
  datos_tecnicos?: Record<string, unknown> | null;
  activo?: boolean;
  serializado?: boolean;
}

export interface HistorialEntry {
  id: string;
  activo_id: string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  accion: string;
  cambios: Record<string, unknown> | null;
  creado_en: string;
}

export interface Observacion {
  id: string;
  activo_id: string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  texto: string;
  creado_en: string;
}

export interface EpcDecodedInfo {
  epc: string;
  scheme: string | null;
  articulo_code: number | null;
  articulo_sugerido: string | null;
  serial: number | null;
  serial_hex: string | null;
  system_suffix?: string | null;
  del_sistema?: boolean;
  valido: boolean;
  mensaje: string;
}

export interface EtiquetaCodificacionResponse {
  activo_id: string;
  numero_patrimonial: string;
  descripcion: string;
  epc: string;
  epc_asignado: boolean;
  regenerado: boolean;
  decodificado: EpcDecodedInfo;
  stock_etiquetas?: number;
}

export interface EtiquetaLoteItem {
  id: string;
  epc: string;
  serial_hex: string | null;
  serie_fisica?: string | null;
  decodificado: EpcDecodedInfo;
}

export interface EtiquetaLoteResponse {
  activo_id: string;
  numero_patrimonial: string;
  descripcion: string;
  cantidad: number;
  stock_etiquetas: number;
  etiquetas: EtiquetaLoteItem[];
  impreso: boolean;
  modo_simulacion: boolean;
  zpl: string | null;
}

export interface EtiquetaRow {
  id: string;
  activo_id: string;
  epc: string;
  serial_hex: string | null;
  serie_fisica?: string | null;
  estado: string;
  impresa: boolean;
  creado_en: string;
  impresa_en: string | null;
  numero_patrimonial: string | null;
  descripcion: string | null;
  decodificado: EpcDecodedInfo | null;
}

export interface Fotografia {
  id: string;
  activo_id: string;
  nombre_archivo: string;
  mime_type: string;
  tamano_bytes: number;
  es_principal: boolean;
  creado_en: string;
  url: string;
}

export interface TransferenciaLineaPayload {
  activo_id: string;
  cantidad: number;
  /** Si el SKU está en varias ubicaciones del depósito, indica de cuál salir. */
  ubicacion_origen_id?: string | null;
}

export interface TransferenciaCreatePayload {
  tipo?: "deposito" | "persona";
  deposito_origen_id: string;
  deposito_destino_id?: string | null;
  persona_destino_id?: string | null;
  lineas: TransferenciaLineaPayload[];
  ubicacion_destino_id?: string | null;
  notas?: string | null;
  epcs?: string[];
}

export interface DetalleTransferencia {
  id: string;
  activo_id: string;
  etiqueta_id?: string | null;
  epc: string | null;
  numero_patrimonial: string | null;
  descripcion: string | null;
  ubicacion_origen_id: string | null;
  confirmado_origen: boolean;
  confirmado_destino: boolean;
}

export interface TransferenciaListItem {
  id: string;
  tipo: "deposito" | "persona" | string;
  deposito_origen_id: string;
  deposito_destino_id: string | null;
  ubicacion_destino_id: string | null;
  persona_destino_id?: string | null;
  persona_destino_nombre?: string | null;
  usuario_id?: string | null;
  usuario_nombre?: string | null;
  estado: string;
  total_activos: number;
  confirmados_origen: number;
  confirmados_destino: number;
  creado_en: string;
  enviado_en: string | null;
  completado_en: string | null;
}

export interface Transferencia extends TransferenciaListItem {
  notas: string | null;
  detalles: DetalleTransferencia[];
}

export interface Persona {
  id: string;
  nombre: string;
  documento: string | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface MovimientoItem {
  id: string;
  activo_id: string;
  numero_patrimonial: string | null;
  descripcion: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  accion: string;
  cambios: Record<string, unknown> | null;
  creado_en: string;
}

export interface MovimientosPage {
  total: number;
  limit: number;
  offset: number;
  items: MovimientoItem[];
}

export interface DashboardKpis {
  activos_activos: number;
  depositos_activos: number;
  inventarios_abiertos: number;
  transferencias_abiertas: number;
  stock_total_ubicado: number;
  activos_sin_ubicacion: number;
  cobertura_ubicacion_pct: number;
  inventarios_pendientes_auditoria: number;
  inventarios_con_discrepancia_pendiente: number;
  inventarios_activos_pendientes: number;
  inventarios_avance_pct: number;
  transferencias_en_transito: number;
  transferencias_activos_pendientes: number;
  transferencias_avance_pct: number;
  discrepancias_inventarios_cerrados: {
    faltantes: number;
    sobrantes: number;
    inventarios_con_discrepancia: number;
  };
}

export interface StockDepositoResumen {
  deposito_id: string;
  deposito_nombre: string;
  total: number;
}

export interface TransferenciaResumenDash {
  id: string;
  tipo?: string;
  deposito_origen_id: string;
  deposito_origen_nombre: string | null;
  deposito_destino_id: string | null;
  deposito_destino_nombre: string | null;
  persona_destino_id?: string | null;
  persona_destino_nombre?: string | null;
  estado: string;
  total_activos: number;
  confirmados_origen: number;
  confirmados_destino: number;
  creado_en: string;
}

export interface InventarioResumenDash {
  id: string;
  deposito_id: string;
  deposito_nombre: string | null;
  estado: string;
  total_esperado: number;
  total_encontrado: number;
  total_faltante: number;
  total_sobrante: number;
  total_exceso?: number;
  auditado?: boolean;
  iniciado_en: string;
  cerrado_en: string | null;
}

export interface DispositivoMovilDash {
  id: string;
  modelo: string;
  fabricante: string | null;
  numero_serie: string | null;
  app_version: string | null;
  android_version: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  ultimo_visto_en: string;
  registrado_en: string;
  sesion_activa: boolean;
  en_linea: boolean;
  /** en_linea | inactivo | sesion_cerrada */
  estado?: string;
}

export interface DashboardResumen {
  kpis: DashboardKpis;
  stock_por_deposito: StockDepositoResumen[];
  movimientos_recientes: MovimientoItem[];
  transferencias_recientes: TransferenciaResumenDash[];
  inventarios_recientes: InventarioResumenDash[];
  dispositivos_moviles?: DispositivoMovilDash[];
  movimientos_limit: number;
  ops_limit: number;
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
  total_exceso?: number;
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
  total_exceso?: number;
  iniciado_en: string;
  cerrado_en: string | null;
  auditado: boolean;
  auditado_en: string | null;
  auditado_por_id: string | null;
  comentario_auditoria: string | null;
  ajuste_aplicado?: boolean;
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
  total_exceso?: number;
  iniciado_en: string;
  cerrado_en: string | null;
  auditado: boolean;
  auditado_en: string | null;
  auditado_por_id: string | null;
  comentario_auditoria: string | null;
  ajuste_aplicado?: boolean;
  resumen: InventarioResumen;
  detalles: DetalleInventario[];
}

export interface InventarioReporte {
  inventario_id: string;
  deposito_id: string;
  estado: string;
  iniciado_en: string;
  cerrado_en: string | null;
  auditado?: boolean;
  auditado_en?: string | null;
  auditado_por_id?: string | null;
  comentario_auditoria?: string | null;
  ajuste_aplicado?: boolean;
  resumen: InventarioResumen;
  coincidencia_pct: number;
  tiene_discrepancias: boolean;
  encontrados: DetalleInventario[];
  faltantes: DetalleInventario[];
  excesos?: DetalleInventario[];
  ajenos?: DetalleInventario[];
  sobrantes: DetalleInventario[];
  sin_epc: DetalleInventario[];
}

export interface InventarioAuditarPayload {
  comentario?: string | null;
  auditado?: boolean;
}

export interface InventarioDescartarPayload {
  comentario: string;
}
