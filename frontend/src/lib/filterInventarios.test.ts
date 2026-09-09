import { describe, it, expect } from "vitest";
import { filterInventarios, hasActiveInventariosFilters } from "./filterInventarios";
import type { InventarioListItem } from "../types";

const base: InventarioListItem = {
  id: "inv-1",
  deposito_id: "dep-1",
  sector_id: null,
  ubicacion_id: null,
  estado: "cerrado",
  iniciado_en: "2024-01-01T00:00:00Z",
  cerrado_en: "2024-01-01T01:00:00Z",
  total_esperado: 10,
  total_encontrado: 8,
  total_faltante: 2,
  total_sobrante: 0,
  auditado: false,
  auditado_en: null,
  auditado_por_id: null,
  comentario_auditoria: null,
};

describe("filterInventarios", () => {
  it("filtra por estado, depósito, discrepancias y auditoría", () => {
    const lista: InventarioListItem[] = [
      base,
      {
        ...base,
        id: "inv-2",
        estado: "en_curso",
        total_faltante: 0,
        total_sobrante: 0,
        deposito_id: "dep-2",
      },
      {
        ...base,
        id: "inv-3",
        auditado: true,
        auditado_en: "2024-01-02T00:00:00Z",
        total_faltante: 0,
      },
    ];
    const nombre = (id: string) => (id === "dep-1" ? "Central" : "Sur");

    expect(
      filterInventarios(
        lista,
        { search: "central", estado: "", soloDiscrepancias: false, soloPendienteAuditoria: false },
        nombre,
      ),
    ).toHaveLength(2);
    expect(
      filterInventarios(
        lista,
        { search: "", estado: "en_curso", soloDiscrepancias: false, soloPendienteAuditoria: false },
        nombre,
      ),
    ).toHaveLength(1);
    expect(
      filterInventarios(
        lista,
        { search: "", estado: "", soloDiscrepancias: true, soloPendienteAuditoria: false },
        nombre,
      ),
    ).toHaveLength(1);
    expect(
      filterInventarios(
        lista,
        { search: "", estado: "", soloDiscrepancias: false, soloPendienteAuditoria: true },
        nombre,
      ),
    ).toHaveLength(1);
  });

  it("detecta filtros activos", () => {
    expect(
      hasActiveInventariosFilters({
        search: "",
        estado: "",
        soloDiscrepancias: false,
        soloPendienteAuditoria: false,
      }),
    ).toBe(false);
    expect(
      hasActiveInventariosFilters({
        search: "",
        estado: "",
        soloDiscrepancias: true,
        soloPendienteAuditoria: false,
      }),
    ).toBe(true);
    expect(
      hasActiveInventariosFilters({
        search: "",
        estado: "",
        soloDiscrepancias: false,
        soloPendienteAuditoria: true,
      }),
    ).toBe(true);
  });
});
