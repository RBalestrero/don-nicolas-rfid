import { describe, it, expect } from "vitest";
import { buildAttentionItems } from "./attentionItems";
import type { DashboardResumen } from "../types";

const baseResumen: DashboardResumen = {
  kpis: {
    activos_activos: 12,
    depositos_activos: 3,
    inventarios_abiertos: 1,
    transferencias_abiertas: 0,
    stock_total_ubicado: 10,
    activos_sin_ubicacion: 2,
    cobertura_ubicacion_pct: 83,
    inventarios_pendientes_auditoria: 2,
    inventarios_con_discrepancia_pendiente: 1,
    inventarios_activos_pendientes: 0,
    inventarios_avance_pct: 100,
    transferencias_en_transito: 0,
    transferencias_activos_pendientes: 0,
    transferencias_avance_pct: 100,
    discrepancias_inventarios_cerrados: {
      faltantes: 2,
      sobrantes: 0,
      inventarios_con_discrepancia: 1,
    },
  },
  stock_por_deposito: [],
  movimientos_recientes: [],
  transferencias_recientes: [],
  inventarios_recientes: [
    {
      id: "inv-disc",
      deposito_id: "dep-2",
      deposito_nombre: "Sur",
      estado: "cerrado",
      auditado: false,
      total_esperado: 10,
      total_encontrado: 8,
      total_faltante: 2,
      total_sobrante: 0,
      total_exceso: 0,
      iniciado_en: "2024-06-01T10:00:00Z",
      cerrado_en: "2024-06-01T11:00:00Z",
    },
    {
      id: "inv-audit",
      deposito_id: "dep-1",
      deposito_nombre: "Norte",
      estado: "cerrado",
      auditado: false,
      total_esperado: 5,
      total_encontrado: 5,
      total_faltante: 0,
      total_sobrante: 0,
      total_exceso: 0,
      iniciado_en: "2024-06-01T09:00:00Z",
      cerrado_en: "2024-06-01T09:30:00Z",
    },
    {
      id: "inv-ok",
      deposito_id: "dep-1",
      deposito_nombre: "Norte",
      estado: "cerrado",
      auditado: true,
      total_esperado: 3,
      total_encontrado: 3,
      total_faltante: 0,
      total_sobrante: 0,
      total_exceso: 0,
      iniciado_en: "2024-05-01T09:00:00Z",
      cerrado_en: "2024-05-01T09:30:00Z",
    },
  ],
  movimientos_limit: 15,
  ops_limit: 12,
};

describe("buildAttentionItems", () => {
  it("prioriza discrepancias y omite inventarios ya auditados", () => {
    const items = buildAttentionItems(baseResumen);
    expect(items[0]?.severity).toBe("danger");
    expect(items.some((i) => i.title.includes("Sur"))).toBe(true);
    expect(items.some((i) => i.title.includes("Norte") && i.badge === "Auditoría")).toBe(true);
    expect(items.some((i) => i.id === "inv-ok")).toBe(false);
  });

  it("incluye activos sin ubicación", () => {
    const items = buildAttentionItems(baseResumen);
    const ubi = items.find((i) => i.id === "act-sin-ubi");
    expect(ubi).toBeDefined();
    expect(ubi?.page).toBe("activos");
    expect(ubi?.filterValue).toBe("sin");
  });

  it("devuelve vacío cuando no hay pendientes", () => {
    const clear: DashboardResumen = {
      ...baseResumen,
      kpis: {
        ...baseResumen.kpis,
        activos_sin_ubicacion: 0,
        cobertura_ubicacion_pct: 100,
        inventarios_pendientes_auditoria: 0,
        inventarios_con_discrepancia_pendiente: 0,
        stock_total_ubicado: 12,
      },
      inventarios_recientes: baseResumen.inventarios_recientes.map((i) => ({
        ...i,
        auditado: true,
      })),
    };
    expect(buildAttentionItems(clear)).toEqual([]);
  });
});
