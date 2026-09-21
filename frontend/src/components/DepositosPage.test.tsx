import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DepositosPage from "./DepositosPage";

vi.mock("../lib/usePermissions", () => ({
  usePermissions: () => ({
    rol: "admin",
    roleLabel: "Admin",
    canWriteAssets: true,
    canWriteAssignment: true,
    canWriteWarehouse: true,
    canWriteTransfer: true,
    canCancelTransfer: true,
  }),
}));

vi.stubGlobal("fetch", vi.fn());

function mockJson(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => data,
  } as Response;
}

describe("DepositosPage", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    sessionStorage.setItem("don_nicolas_token", "test-token");
  });

  it("renderiza listado y permite crear un depósito", async () => {
    const user = userEvent.setup();
    const deposito = {
      id: "dep-1",
      nombre: "Depósito Central",
      descripcion: null,
      direccion: null,
      activo: true,
      creado_en: "2024-01-01T00:00:00Z",
      actualizado_en: "2024-01-01T00:00:00Z",
    };

    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/depositos") && method === "GET" && !url.includes("include_tree") && !url.includes("/stock")) {
        return mockJson([]);
      }
      if (url.includes("/depositos") && method === "POST") {
        return mockJson(deposito, 201);
      }
      if (url.includes("include_tree=true")) {
        return mockJson({ ...deposito, sectores: [] });
      }
      if (url.includes("/stock")) {
        return mockJson({
          deposito_id: deposito.id,
          deposito_nombre: deposito.nombre,
          total: 0,
          activos: [],
        });
      }
      return mockJson([]);
    });

    render(<DepositosPage />);

    expect(await screen.findByRole("heading", { name: /^depósitos$/i })).toBeInTheDocument();
    expect(await screen.findByText(/sin depósitos/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /\+ nuevo depósito/i })[0]);
    await user.type(screen.getByLabelText(/^nombre$/i), "Depósito Central");
    await user.click(screen.getByRole("button", { name: /crear depósito/i }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining("/depositos"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("expande depósito → sector → ubicación y muestra artículos a la derecha", async () => {
    const user = userEvent.setup();
    const deposito = {
      id: "dep-1",
      nombre: "Soporte técnico",
      descripcion: null,
      direccion: null,
      activo: true,
      creado_en: "2024-01-01T00:00:00Z",
      actualizado_en: "2024-01-01T00:00:00Z",
    };
    const detalle = {
      ...deposito,
      sectores: [
        {
          id: "sec-1",
          deposito_id: "dep-1",
          nombre: "R1",
          descripcion: null,
          activo: true,
          creado_en: "2024-01-01T00:00:00Z",
          actualizado_en: "2024-01-01T00:00:00Z",
          ubicaciones: [
            {
              id: "ubi-1",
              sector_id: "sec-1",
              codigo: "E2",
              descripcion: null,
              activo: true,
              creado_en: "2024-01-01T00:00:00Z",
              actualizado_en: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
    };
    const unit = {
      activo_id: "act-1",
      numero_patrimonial: "ZD6A142-301LR2EZ",
      descripcion: "Impresora Zebra",
      categoria_id: "cat-1",
      categoria_nombre: "IT",
      ubicacion_id: "ubi-1",
      ubicacion_codigo: "E2",
      sector_id: "sec-1",
      sector_nombre: "R1",
    };

    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method !== "GET") return mockJson({});
      if (url.includes("/activos/act-1") && !url.includes("/historial") && !url.includes("/observaciones") && !url.includes("/fotografias") && !url.includes("/etiquetas") && !url.includes("/ubicacion")) {
        return mockJson({
          id: "act-1",
          numero_patrimonial: "ZD6A142-301LR2EZ",
          descripcion: "Impresora Zebra",
          categoria_id: "cat-1",
          epc: null,
          datos_tecnicos: null,
          activo: true,
          creado_en: "2024-01-01T00:00:00Z",
          actualizado_en: "2024-01-01T00:00:00Z",
          categoria: {
            id: "cat-1",
            nombre: "IT",
            descripcion: null,
            activa: true,
            creado_en: "2024-01-01T00:00:00Z",
            actualizado_en: "2024-01-01T00:00:00Z",
          },
          ubicacion: {
            ubicacion_id: "ubi-1",
            ubicacion_codigo: "E2",
            sector_id: "sec-1",
            sector_nombre: "R1",
            deposito_id: "dep-1",
            deposito_nombre: "Soporte técnico",
          },
        });
      }
      if (url.includes("/categorias")) {
        return mockJson([
          {
            id: "cat-1",
            nombre: "IT",
            descripcion: null,
            activa: true,
            creado_en: "2024-01-01T00:00:00Z",
            actualizado_en: "2024-01-01T00:00:00Z",
          },
        ]);
      }
      if (url.includes("/historial") || url.includes("/movimientos") || url.includes("/observaciones") || url.includes("/etiquetas") || url.includes("/fotografias") || url.includes("/config/impresora")) {
        return mockJson([]);
      }
      if (url.includes("/stock")) {
        return mockJson({
          deposito_id: deposito.id,
          deposito_nombre: deposito.nombre,
          total: 2,
          activos: [
            { ...unit, epc: "E280AAA" },
            { ...unit, epc: "E280BBB" },
          ],
        });
      }
      if (url.includes("include_tree=true")) return mockJson(detalle);
      if (url.includes("/depositos")) return mockJson([deposito]);
      return mockJson([]);
    });

    const onNavigate = vi.fn();
    render(<DepositosPage onNavigate={onNavigate} />);

    expect(await screen.findByRole("heading", { name: /^estructura$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^artículos$/i })).toBeInTheDocument();
    expect(screen.getByText(/elegí una ubicación/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^r1/i })).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /soporte técnico/i }));

    expect(await screen.findByRole("button", { name: /^r1/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^e2/i })).not.toBeInTheDocument();
    expect(screen.getByText(/elegí una ubicación/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^r1/i }));

    expect(await screen.findByRole("button", { name: /^e2/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /soporte técnico/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^e2/i }));

    expect(await screen.findByText("ZD6A142-301LR2EZ")).toBeInTheDocument();
    expect(screen.getAllByText(/2 u\./).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("E280AAA")).not.toBeInTheDocument();
    expect(screen.queryByText(/elegí una ubicación/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ver artículo zd6a142-301lr2ez/i }));

    expect(await screen.findByRole("heading", { name: /ZD6A142-301LR2EZ/i })).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("dn_act_focus")).toBeNull();
  });

  it("abre el menú ⋮ con acciones según la selección", async () => {
    const user = userEvent.setup();
    const deposito = {
      id: "dep-1",
      nombre: "Soporte técnico",
      descripcion: null,
      direccion: null,
      activo: true,
      creado_en: "2024-01-01T00:00:00Z",
      actualizado_en: "2024-01-01T00:00:00Z",
    };
    const detalle = {
      ...deposito,
      sectores: [
        {
          id: "sec-1",
          deposito_id: "dep-1",
          nombre: "R1",
          descripcion: null,
          activo: true,
          creado_en: "2024-01-01T00:00:00Z",
          actualizado_en: "2024-01-01T00:00:00Z",
          ubicaciones: [
            {
              id: "ubi-1",
              sector_id: "sec-1",
              codigo: "E2",
              descripcion: null,
              activo: true,
              creado_en: "2024-01-01T00:00:00Z",
              actualizado_en: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
    };

    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method !== "GET") return mockJson({});
      if (url.includes("/stock")) {
        return mockJson({
          deposito_id: deposito.id,
          deposito_nombre: deposito.nombre,
          total: 0,
          activos: [],
        });
      }
      if (url.includes("include_tree=true")) return mockJson(detalle);
      if (url.includes("/depositos")) return mockJson([deposito]);
      return mockJson([]);
    });

    render(<DepositosPage />);

    expect(await screen.findByRole("heading", { name: /^estructura$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /acciones de estructura/i }));
    expect(screen.getByRole("menuitem", { name: /nuevo depósito/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /nuevo sector/i })).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /soporte técnico/i }));
    expect(await screen.findByRole("button", { name: /^r1/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /acciones de estructura/i }));
    expect(screen.getByRole("menuitem", { name: /nuevo sector/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /editar depósito/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^r1/i }));
    expect(await screen.findByRole("button", { name: /^e2/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /acciones de estructura/i }));
    expect(screen.getByRole("menuitem", { name: /nueva ubicación/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /editar sector/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^e2/i }));
    await user.click(screen.getByRole("button", { name: /acciones de estructura/i }));
    expect(screen.getByRole("menuitem", { name: /editar ubicación/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /eliminar ubicación/i })).toBeInTheDocument();
  });
});
