import { describe, expect, it } from "vitest";
import {
  etiquetaUbicacionesSku,
  groupStockBySku,
  groupTransferDetalles,
  skuCoincideBusqueda,
} from "./groupStockBySku";
import type { DetalleTransferencia, StockActivoDetalle } from "../types";

function unit(over: Partial<StockActivoDetalle> = {}): StockActivoDetalle {
  return {
    activo_id: "act-1",
    numero_patrimonial: "SKU-1",
    descripcion: "Caja",
    categoria_id: "cat-1",
    categoria_nombre: "General",
    epc: "E280AAA",
    ubicacion_id: "ubi-1",
    ubicacion_codigo: "A-01",
    sector_id: "sec-1",
    sector_nombre: "Sector A",
    ...over,
  };
}

describe("groupStockBySku", () => {
  it("agrupa unidades del mismo SKU y no usa el EPC como identidad", () => {
    const grouped = groupStockBySku([
      unit({ epc: "E280AAA" }),
      unit({ epc: "E280BBB" }),
      unit({
        activo_id: "act-2",
        numero_patrimonial: "SKU-2",
        descripcion: "Pallet",
        epc: "E280CCC",
      }),
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({
      activo_id: "act-1",
      numero_patrimonial: "SKU-1",
      unidades: 2,
    });
    expect(grouped[1]).toMatchObject({ activo_id: "act-2", unidades: 1 });
    expect(JSON.stringify(grouped)).not.toMatch(/E280/);
  });

  it("no reduce unidades al buscar por una de varias ubicaciones", () => {
    const grouped = groupStockBySku([
      unit({ ubicacion_codigo: "A-01", sector_nombre: "Sector A" }),
      unit({
        epc: "E280BBB",
        ubicacion_codigo: "B-02",
        sector_nombre: "Sector B",
      }),
    ]);
    expect(grouped[0].unidades).toBe(2);
    expect(etiquetaUbicacionesSku(grouped[0])).toBe("2 ubicaciones");
    expect(skuCoincideBusqueda(grouped[0], "a-01")).toBe(true);
    expect(skuCoincideBusqueda(grouped[0], "inexistente")).toBe(false);
  });
});

describe("groupTransferDetalles", () => {
  it("resume cantidad por SKU", () => {
    const det = (id: string, epc: string): DetalleTransferencia => ({
      id,
      activo_id: "act-1",
      epc,
      numero_patrimonial: "SKU-1",
      descripcion: "Caja",
      ubicacion_origen_id: "ubi-1",
      confirmado_origen: false,
      confirmado_destino: false,
    });
    const grouped = groupTransferDetalles([det("d1", "E280AAA"), det("d2", "E280BBB")]);
    expect(grouped).toEqual([
      {
        activo_id: "act-1",
        numero_patrimonial: "SKU-1",
        descripcion: "Caja",
        unidades: 2,
        confirmado_origen: false,
        confirmado_destino: false,
      },
    ]);
  });
});
