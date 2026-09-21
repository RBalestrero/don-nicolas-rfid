import { describe, it, expect } from "vitest";
import {
  filterTransferencias,
  hasActiveTransferenciasFilters,
} from "./filterTransferencias";
import type { TransferenciaListItem } from "../types";

const item = (partial: Partial<TransferenciaListItem> & { id: string }): TransferenciaListItem => ({
  id: partial.id,
  tipo: partial.tipo ?? "deposito",
  deposito_origen_id: partial.deposito_origen_id ?? "dep-1",
  deposito_destino_id: partial.deposito_destino_id ?? "dep-2",
  ubicacion_destino_id: null,
  persona_destino_id: partial.persona_destino_id ?? null,
  persona_destino_nombre: partial.persona_destino_nombre ?? null,
  estado: partial.estado ?? "pendiente",
  total_activos: partial.total_activos ?? 1,
  confirmados_origen: 0,
  confirmados_destino: 0,
  creado_en: "2024-01-01T00:00:00Z",
  enviado_en: null,
  completado_en: null,
  usuario_id: null,
  usuario_nombre: null,
});

describe("filterTransferencias", () => {
  it("filtra por estado y nombre de depósito", () => {
    const lista = [
      item({ id: "t1", estado: "pendiente" }),
      item({ id: "t2", estado: "completada", deposito_destino_id: "dep-3" }),
    ];
    const nombre = (id: string) =>
      id === "dep-1" ? "Central" : id === "dep-2" ? "Sur" : "Norte";

    expect(
      filterTransferencias(lista, { search: "norte", estado: "" }, nombre),
    ).toHaveLength(1);
    expect(
      filterTransferencias(lista, { search: "", estado: "pendiente" }, nombre),
    ).toHaveLength(1);
    expect(
      filterTransferencias(
        [
          ...lista,
          item({ id: "t3", estado: "en_transito" }),
          item({ id: "t4", estado: "cancelada" }),
        ],
        { search: "", estado: "abiertas" },
        nombre,
      ),
    ).toHaveLength(2);
  });

  it("detecta filtros activos", () => {
    expect(hasActiveTransferenciasFilters({ search: "", estado: "" })).toBe(false);
    expect(hasActiveTransferenciasFilters({ search: "x", estado: "" })).toBe(true);
  });
});
