import type { DetalleTransferencia, StockActivoDetalle } from "../types";

export interface SkuStockGroup {
  activo_id: string;
  numero_patrimonial: string;
  descripcion: string;
  sector_nombre: string;
  ubicacion_codigo: string;
  ubicaciones: string[];
  unidades: number;
}

function ubicacionDeUnidad(a: StockActivoDetalle): string {
  return `${a.sector_nombre}/${a.ubicacion_codigo}`;
}

/** Agrupa unidades RFID del stock en una fila por SKU (activo). */
export function groupStockBySku(items: StockActivoDetalle[]): SkuStockGroup[] {
  const order: string[] = [];
  const byId = new Map<string, SkuStockGroup>();
  for (const a of items) {
    const loc = ubicacionDeUnidad(a);
    const existing = byId.get(a.activo_id);
    if (existing) {
      existing.unidades += 1;
      if (!existing.ubicaciones.includes(loc)) {
        existing.ubicaciones.push(loc);
      }
      continue;
    }
    order.push(a.activo_id);
    byId.set(a.activo_id, {
      activo_id: a.activo_id,
      numero_patrimonial: a.numero_patrimonial,
      descripcion: a.descripcion,
      sector_nombre: a.sector_nombre,
      ubicacion_codigo: a.ubicacion_codigo,
      ubicaciones: [loc],
      unidades: 1,
    });
  }
  return order.map((id) => byId.get(id)!);
}

export function etiquetaUbicacionesSku(g: SkuStockGroup): string {
  if (g.ubicaciones.length <= 1) {
    return g.ubicaciones[0] ?? `${g.sector_nombre}/${g.ubicacion_codigo}`;
  }
  return `${g.ubicaciones.length} ubicaciones`;
}

export function skuCoincideBusqueda(g: SkuStockGroup, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [g.numero_patrimonial, g.descripcion, ...g.ubicaciones]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(needle));
}

export interface SkuTransferGroup {
  activo_id: string;
  numero_patrimonial: string | null;
  descripcion: string | null;
  unidades: number;
  confirmado_origen: boolean;
  confirmado_destino: boolean;
}

/** Agrupa detalles de una orden por SKU, sin exponer EPC. */
export function groupTransferDetalles(detalles: DetalleTransferencia[]): SkuTransferGroup[] {
  const order: string[] = [];
  const byId = new Map<string, SkuTransferGroup>();
  for (const d of detalles) {
    const existing = byId.get(d.activo_id);
    if (existing) {
      existing.unidades += 1;
      existing.confirmado_origen = existing.confirmado_origen && d.confirmado_origen;
      existing.confirmado_destino = existing.confirmado_destino && d.confirmado_destino;
      continue;
    }
    order.push(d.activo_id);
    byId.set(d.activo_id, {
      activo_id: d.activo_id,
      numero_patrimonial: d.numero_patrimonial,
      descripcion: d.descripcion,
      unidades: 1,
      confirmado_origen: d.confirmado_origen,
      confirmado_destino: d.confirmado_destino,
    });
  }
  return order.map((id) => byId.get(id)!);
}
