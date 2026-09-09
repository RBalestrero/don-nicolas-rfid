import { describe, it, expect } from "vitest";
import { filterActivos, hasActiveActivosFilters } from "./filterActivos";
import type { Activo, UbicacionAsignada } from "../types";

const base: Activo = {
  id: "a1",
  numero_patrimonial: "PAT-100",
  descripcion: "Notebook Lenovo",
  categoria_id: "cat-it",
  epc: "E280AAA",
  datos_tecnicos: null,
  activo: true,
  creado_en: "2024-01-01T00:00:00Z",
  actualizado_en: "2024-01-01T00:00:00Z",
  categoria: {
    id: "cat-it",
    nombre: "Informática",
    descripcion: null,
    activa: true,
    creado_en: "2024-01-01T00:00:00Z",
    actualizado_en: "2024-01-01T00:00:00Z",
  },
};

const ubicada: UbicacionAsignada = {
  activo_id: "a1",
  ubicacion_id: "u1",
  ubicacion_codigo: "A-01",
  sector_id: "s1",
  sector_nombre: "Sector A",
  deposito_id: "d1",
  deposito_nombre: "Central",
};

describe("filterActivos", () => {
  it("filtra por búsqueda patrimonial / EPC / ubicación", () => {
    const lista = [base, { ...base, id: "a2", numero_patrimonial: "PAT-200", epc: null }];
    const ubis = { a1: ubicada, a2: null };

    expect(filterActivos(lista, ubis, { search: "e280", categoriaId: "", ubicacion: "all" })).toHaveLength(1);
    expect(filterActivos(lista, ubis, { search: "central", categoriaId: "", ubicacion: "all" })[0].id).toBe("a1");
    expect(filterActivos(lista, ubis, { search: "", categoriaId: "", ubicacion: "sin" })[0].id).toBe("a2");
  });

  it("detecta filtros activos", () => {
    expect(hasActiveActivosFilters({ search: "", categoriaId: "", ubicacion: "all" })).toBe(false);
    expect(hasActiveActivosFilters({ search: "x", categoriaId: "", ubicacion: "all" })).toBe(true);
    expect(hasActiveActivosFilters({ search: "", categoriaId: "", ubicacion: "con" })).toBe(true);
  });
});
