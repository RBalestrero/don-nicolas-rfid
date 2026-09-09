import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InventariosPage from "./InventariosPage";

vi.mock("../lib/usePermissions", () => ({
  usePermissions: () => ({
    rol: "admin",
    roleLabel: "Admin",
    canWriteAssets: true,
    canWriteAssignment: true,
    canWriteWarehouse: true,
    canWriteTransfer: true,
    canCancelTransfer: true,
    canAuditInventory: true,
  }),
}));

const deposito = {
  id: "dep-1",
  nombre: "Central",
  descripcion: null,
  direccion: null,
  activo: true,
  creado_en: "2024-01-01T00:00:00Z",
  actualizado_en: "2024-01-01T00:00:00Z",
};

const inventarioListItem = {
  id: "inv-1",
  deposito_id: "dep-1",
  sector_id: null,
  ubicacion_id: null,
  usuario_id: "u-1",
  estado: "cerrado",
  total_esperado: 2,
  total_encontrado: 1,
  total_faltante: 1,
  total_sobrante: 0,
  iniciado_en: "2024-01-01T12:00:00Z",
  cerrado_en: "2024-01-01T13:00:00Z",
  auditado: false,
  auditado_en: null,
  auditado_por_id: null,
  comentario_auditoria: null,
};

const inventario = {
  ...inventarioListItem,
  resumen: {
    total_esperado: 2,
    total_encontrado: 1,
    total_faltante: 1,
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
      estado: "encontrado",
      leido_en: "2024-01-01T12:30:00Z",
    },
    {
      id: "d2",
      activo_id: "a2",
      epc: "E280BBB",
      numero_patrimonial: "PAT-2",
      descripcion: "Item 2",
      estado: "faltante",
      leido_en: null,
    },
  ],
};

const reporte = {
  inventario_id: "inv-1",
  deposito_id: "dep-1",
  estado: "cerrado",
  iniciado_en: "2024-01-01T12:00:00Z",
  cerrado_en: "2024-01-01T13:00:00Z",
  auditado: false,
  auditado_en: null,
  auditado_por_id: null,
  comentario_auditoria: null,
  coincidencia_pct: 50,
  tiene_discrepancias: true,
  resumen: inventario.resumen,
  encontrados: [inventario.detalles[0]],
  faltantes: [inventario.detalles[1]],
  sobrantes: [],
  sin_epc: [],
};

const inventarioAuditado = {
  ...inventario,
  auditado: true,
  auditado_en: "2024-01-01T14:00:00Z",
  auditado_por_id: "u-1",
  comentario_auditoria: "Faltante localizado en rack B",
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
          return { ok: true, status: 200, json: async () => [inventarioListItem] };
        }
        if (url.endsWith("/inventarios/inv-1") && method === "GET") {
          return { ok: true, status: 200, json: async () => inventario };
        }
        if (url.endsWith("/inventarios/inv-1/reporte") && method === "GET") {
          return { ok: true, status: 200, json: async () => reporte };
        }
        if (url.includes("/inventarios/inv-1/auditar") && method === "POST") {
          return { ok: true, status: 200, json: async () => inventarioAuditado };
        }
        if (method === "POST" && url.includes("/inventarios") && !url.includes("/auditar")) {
          return {
            ok: false,
            status: 405,
            statusText: "Method Not Allowed",
            json: async () => ({ detail: "Los inventarios se operan desde la APK" }),
          };
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

  it("lista sesiones y abre auditoría de un inventario cerrado", async () => {
    const user = userEvent.setup();
    render(<InventariosPage />);

    expect(await screen.findByText(/auditoría de conteos/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nuevo conteo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /iniciar inventario/i })).not.toBeInTheDocument();

    expect(await screen.findByText("Central")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cerrado" })).toBeInTheDocument();
    expect(screen.getAllByText("Cerrado").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^auditar$/i }));

    expect(await screen.findByText(/reporte de auditoría/i)).toBeInTheDocument();
    expect(screen.getByText(/coincidencia/i)).toBeInTheDocument();
    expect(screen.getByText("PAT-1")).toBeInTheDocument();
    expect(screen.getByText("PAT-2")).toBeInTheDocument();
    expect(screen.queryByLabelText(/epcs leídos/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cerrar inventario/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /marcar como auditada/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
        expect.stringMatching(/\/inventarios$/),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("marca un inventario cerrado como auditado con comentario", async () => {
    const user = userEvent.setup();
    render(<InventariosPage />);

    await user.click(await screen.findByRole("button", { name: /^auditar$/i }));
    const marcar = await screen.findByRole("button", { name: /marcar como auditada/i });

    const comentario = screen.getByPlaceholderText(/faltantes localizados/i);
    await user.clear(comentario);
    await user.type(comentario, "Faltante localizado en rack B");
    await user.click(marcar);

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining("/inventarios/inv-1/auditar"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(
      await screen.findByRole("button", { name: /actualizar comentario/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Auditada").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: /marcar como auditada/i })).not.toBeInTheDocument();
  });
});
