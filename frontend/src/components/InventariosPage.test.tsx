import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InventariosPage from "./InventariosPage";

const deposito = {
  id: "dep-1",
  nombre: "Central",
  descripcion: null,
  direccion: null,
  activo: true,
  creado_en: "2024-01-01T00:00:00Z",
  actualizado_en: "2024-01-01T00:00:00Z",
};

const inventario = {
  id: "inv-1",
  deposito_id: "dep-1",
  sector_id: null,
  ubicacion_id: null,
  usuario_id: "u-1",
  estado: "en_curso",
  total_esperado: 2,
  total_encontrado: 0,
  total_faltante: 2,
  total_sobrante: 0,
  iniciado_en: "2024-01-01T12:00:00Z",
  cerrado_en: null,
  resumen: {
    total_esperado: 2,
    total_encontrado: 0,
    total_faltante: 2,
    total_sobrante: 0,
    sin_epc: 0,
  },
  detalles: [
    {
      id: "d1",
      activo_id: "a1",
      epc: "E280AAA",
      numero_patrimonial: "PAT-1",
      descripcion: "Item 1",
      estado: "esperado",
      leido_en: null,
    },
  ],
};

describe("InventariosPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();

        if (url.endsWith("/depositos") && method === "GET") {
          return { ok: true, status: 200, json: async () => [deposito] };
        }
        if (url.includes("/inventarios?") && method === "GET") {
          return { ok: true, status: 200, json: async () => [] };
        }
        if (url.endsWith("/inventarios") && method === "POST") {
          return { ok: true, status: 201, json: async () => inventario };
        }
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: async () => ({ detail: "not found" }),
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("crea un inventario y muestra métricas esperadas", async () => {
    const user = userEvent.setup();
    render(<InventariosPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/depósito para inventario/i)).toBeEnabled();
    });

    await user.selectOptions(screen.getByLabelText(/depósito para inventario/i), "dep-1");
    await user.click(screen.getByRole("button", { name: /iniciar inventario/i }));

    expect(await screen.findByText("En curso")).toBeInTheDocument();
    expect(screen.getByLabelText(/epcs leídos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar inventario/i })).toBeInTheDocument();
    expect(screen.getByText(/Esperados con EPC:\s*1/)).toBeInTheDocument();
    expect(screen.getByText("Esperado").closest(".status-item")?.querySelector("strong")).toHaveTextContent(
      "2",
    );
  });
});
