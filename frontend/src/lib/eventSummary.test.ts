import { describe, it, expect } from "vitest";
import { summarizeEvent, formatAccionLabel } from "./eventSummary";

describe("eventSummary", () => {
  it("traduce acciones a títulos legibles", () => {
    expect(formatAccionLabel("etiqueta_impresa")).toBe("Etiquetas impresas");
    expect(formatAccionLabel("creacion")).toBe("Alta del artículo");
  });

  it("oculta UUIDs y EPCs técnicos", () => {
    const view = summarizeEvent("transferencia", {
      transferencia_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      deposito_origen_id: "11111111-1111-1111-1111-111111111111",
      deposito_destino_id: "22222222-2222-2222-2222-222222222222",
      deposito_origen: "Depósito Norte",
      deposito_destino: "Depósito Sur",
      cantidad: 3,
      epc: "D10001ABCDEF1234",
      ubicacion_codigo: "A-01",
      ubicacion_id: {
        anterior: "33333333-3333-3333-3333-333333333333",
        nuevo: "44444444-4444-4444-4444-444444444444",
      },
    });

    expect(view.title).toBe("Movimiento a depósito");
    expect(view.facts).toEqual([
      "3 unidades",
      "Origen: Depósito Norte → Destino: Depósito Sur",
      "Ubicación destino: A-01",
    ]);
    expect(view.linkLabel).toBe("Ver movimiento");
    expect(view.facts.join(" ")).not.toMatch(/uuid|aaaa|D10001|1111/i);
  });

  it("resume entrega a persona con cantidad", () => {
    const view = summarizeEvent("entrega_persona", {
      transferencia_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      deposito_origen: "Depósito Norte",
      persona_nombre: "Juan Pérez",
      cantidad: 1,
    });

    expect(view.title).toBe("Entrega a persona");
    expect(view.facts).toContain("1 unidad");
    expect(view.facts).toContain("Origen: Depósito Norte");
    expect(view.facts).toContain("Entregado a: Juan Pérez");
    expect(view.linkLabel).toBe("Ver movimiento");
  });

  it("resume impresión de etiquetas sin dumps JSON", () => {
    const view = summarizeEvent("etiqueta_impresa", {
      cantidad: 3,
      stock_etiquetas: 5,
      modo: "nueva",
      epcs: ["E1", "E2", "E3"],
    });

    expect(view.title).toBe("Etiquetas impresas");
    expect(view.facts).toContain("3 etiquetas");
    expect(view.facts).toContain("Stock resultante: 5");
    expect(view.facts).toContain("Alta de unidades nuevas");
    expect(view.tone).toBe("ok");
  });

  it("formatea diffs de campos conocidos", () => {
    const view = summarizeEvent("actualizacion", {
      descripcion: { anterior: "Viejo", nuevo: "Nuevo" },
      categoria_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });

    expect(view.facts).toContain("Descripción: Viejo → Nuevo");
    expect(view.facts).toContain("Categoría actualizada");
  });
});
