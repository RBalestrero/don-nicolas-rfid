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
};

describe("filterInventarios", () => {
  it("filtra por estado, depósito y discrepancias", () => {
    const lista: InventarioListItem[] = [
      base,
      { ...base, id: "inv-2", estado: "en_curso", total_faltante: 0, total_sobrante: 0, deposito_id: "dep-2" },
    ];
    const nombre = (id: string) => (id === "dep-1" ? "Central" : "Sur");

    expect(
      filterInventarios(lista, { search: "central", estado: "", soloDiscrepancias: false }, nombre),
    ).toHaveLength(1);
    expect(
      filterInventarios(lista, { search: "", estado: "en_curso", soloDiscrepancias: false }, nombre),
    ).toHaveLength(1);
    expect(
      filterInventarios(lista, { search: "", estado: "", soloDiscrepancias: true }, nombre),
    ).toHaveLength(1);
  });

  it("detecta filtros activos", () => {
    expect(hasActiveInventariosFilters({ search: "", estado: "", soloDiscrepancias: false })).toBe(false);
    expect(hasActiveInventariosFilters({ search: "", estado: "", soloDiscrepancias: true })).toBe(true);
  });
});
