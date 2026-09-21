import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import ImprimirEtiquetasModal from "./ImprimirEtiquetasModal";

const permsState = vi.hoisted(() => ({
  canWriteAssets: true,
  canManageUsers: true,
  canManageRoles: false,
}));

vi.mock("../lib/usePermissions", () => ({
  usePermissions: () => ({
    rol: "admin",
    roleLabel: "Admin",
    canWriteAssets: permsState.canWriteAssets,
    canWriteAssignment: true,
    canWriteWarehouse: true,
    canWriteTransfer: true,
    canCancelTransfer: true,
    canManageUsers: permsState.canManageUsers,
    canManageRoles: permsState.canManageRoles,
    canAuditInventory: true,
  }),
}));

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api";

const apiFetchMock = vi.mocked(apiFetch);

const activo = {
  id: "act-1",
  numero_patrimonial: "SKU-1",
  descripcion: "Caja",
  categoria_id: "cat-1",
  epc: null,
  datos_tecnicos: null,
  activo: true,
  creado_en: "2024-01-01T00:00:00Z",
  actualizado_en: "2024-01-01T00:00:00Z",
  stock_etiquetas: 2,
  categoria: {
    id: "cat-1",
    nombre: "General",
    descripcion: null,
    activa: true,
    creado_en: "2024-01-01T00:00:00Z",
    actualizado_en: "2024-01-01T00:00:00Z",
  },
};

const lote = {
  activo_id: "act-1",
  numero_patrimonial: "SKU-1",
  descripcion: "Caja",
  cantidad: 1,
  stock_etiquetas: 3,
  etiquetas: [
    {
      id: "et-1",
      epc: "E280AAA",
      serial_hex: "0001",
      decodificado: {
        epc: "E280AAA",
        scheme: "dn",
        articulo_code: 1,
        articulo_sugerido: "SKU-1",
        serial: 1,
        serial_hex: "0001",
        valido: true,
        mensaje: "ok",
      },
    },
  ],
  impreso: true,
  modo_simulacion: true,
  zpl: null,
};

const printer = {
  host: "10.0.0.5",
  port: 9100,
  simulate: true,
  timeout: 5,
  actualizado_en: "2024-01-02T00:00:00Z",
  fuente: "db",
};

function renderModal(
  props: Partial<ComponentProps<typeof ImprimirEtiquetasModal>> = {},
) {
  const onClose = props.onClose ?? vi.fn();
  const onPrinted = props.onPrinted ?? vi.fn();
  return render(
    <ImprimirEtiquetasModal
      open={props.open ?? true}
      onClose={onClose}
      activos={props.activos ?? [activo]}
      initialActivoId={props.initialActivoId}
      onPrinted={onPrinted}
    />,
  );
}

describe("ImprimirEtiquetasModal", () => {
  beforeEach(() => {
    permsState.canWriteAssets = true;
    permsState.canManageUsers = true;
    permsState.canManageRoles = false;
    apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (path === "/config/impresora" && method === "GET") return printer;
      if (path === "/config/impresora" && method === "PUT") {
        return { ...printer, host: "10.0.0.9", simulate: false };
      }
      if (path === "/activos/act-1/imprimir-etiquetas" && method === "POST") {
        return { ...lote, impreso: true };
      }
      if (path === "/activos/act-1/etiquetas" && method === "POST") {
        return { ...lote, impreso: false, modo_simulacion: true };
      }
      throw new Error(`Unexpected ${method} ${path}`);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("carga impresora y muestra el formulario", async () => {
    renderModal();
    expect(await screen.findByRole("combobox")).toBeEnabled();
    expect(screen.getByText(/10\.0\.0\.5:9100/)).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith("/config/impresora", expect.any(Object));
    expect(apiFetchMock).not.toHaveBeenCalledWith("/activos", expect.any(Object));
  });

  it("preselecciona el artículo inicial", async () => {
    renderModal({ initialActivoId: "act-1" });
    const select = await screen.findByRole("combobox");
    expect(select).toHaveValue("act-1");
  });

  it("imprime y solo codifica por rutas distintas", async () => {
    const user = userEvent.setup();
    const onPrinted = vi.fn();
    renderModal({ onPrinted });

    const select = await screen.findByRole("combobox");
    await user.selectOptions(select, "act-1");
    await user.click(screen.getByRole("button", { name: /^imprimir$/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/activos/act-1/imprimir-etiquetas",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ cantidad: 1, modo: "nueva" }),
        }),
      );
    });
    expect(onPrinted).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /solo codificar/i }));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/activos/act-1/etiquetas",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ cantidad: 1, modo: "nueva" }),
        }),
      );
    });
  });

  it("oculta configurar impresora sin canManageUsers/Roles", async () => {
    permsState.canManageUsers = false;
    permsState.canManageRoles = false;
    renderModal();

    expect(await screen.findByText(/solo lectura/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /configurar impresora/i }),
    ).not.toBeInTheDocument();
  });

  it("permite guardar impresora con canManageUsers", async () => {
    const user = userEvent.setup();
    renderModal();

    await screen.findByRole("combobox");
    await user.click(screen.getByRole("button", { name: /configurar impresora/i }));
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/config/impresora",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  it("no muestra botones de impresión sin canWriteAssets", async () => {
    permsState.canWriteAssets = false;
    renderModal();

    expect(await screen.findByText(/tu rol no puede generar etiquetas/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^imprimir$/i })).not.toBeInTheDocument();
  });
});
