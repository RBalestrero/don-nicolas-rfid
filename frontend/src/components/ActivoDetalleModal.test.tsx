import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivoDetalleModal from "./ActivoDetalleModal";
import type { Activo, UbicacionAsignada } from "../types";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({
    push: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
    toasts: [],
  }),
}));

vi.mock("../lib/usePermissions", () => ({
  usePermissions: () => ({
    canWriteAssets: true,
    canWriteAssignment: true,
    canManageUsers: true,
    canManageRoles: true,
  }),
}));

vi.mock("./ActivoFotos", () => ({
  default: () => <div data-testid="activo-fotos">Fotos</div>,
}));

import { apiFetch } from "../lib/api";

const apiFetchMock = vi.mocked(apiFetch);

const activo: Activo = {
  id: "act-1",
  numero_patrimonial: "PAT-001",
  descripcion: "Notebook Dell",
  categoria_id: "cat-1",
  epc: "E280116060000203ABCD1234",
  datos_tecnicos: null,
  activo: true,
  creado_en: "2024-01-01T00:00:00Z",
  actualizado_en: "2024-06-01T00:00:00Z",
  stock_etiquetas: 2,
  epcs: ["E280116060000203ABCD1234"],
  categoria: {
    id: "cat-1",
    nombre: "Informática",
    descripcion: null,
    activa: true,
    creado_en: "2024-01-01T00:00:00Z",
    actualizado_en: "2024-01-01T00:00:00Z",
  },
};

const ubicacion: UbicacionAsignada = {
  activo_id: "act-1",
  ubicacion_id: "ubi-1",
  ubicacion_codigo: "A-01",
  sector_id: "sec-1",
  sector_nombre: "Sector A",
  deposito_id: "dep-1",
  deposito_nombre: "Central",
};

const categorias = [
  {
    id: "cat-1",
    nombre: "Informática",
    descripcion: null,
    activa: true,
    creado_en: "2024-01-01T00:00:00Z",
    actualizado_en: "2024-01-01T00:00:00Z",
  },
];

describe("ActivoDetalleModal", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue([]);
  });

  it("renderiza pestañas incluyendo Etiquetas y sin edición de patrimonio/ubicación", () => {
    render(
      <ActivoDetalleModal
        open
        activo={activo}
        ubicacion={ubicacion}
        categorias={categorias}
        onClose={vi.fn()}
        onEditSubmit={vi.fn()}
        canWriteAssets
      />,
    );

    expect(screen.getByRole("tab", { name: /^detalle$/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /^etiquetas$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^historial$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^actividad$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^observaciones$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PAT-001" })).toBeInTheDocument();
    expect(screen.getByText(/Central \/ Sector A \/ A-01/)).toBeInTheDocument();
    expect(screen.getByTestId("activo-fotos")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /editar patrimonio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar ubicación/i })).not.toBeInTheDocument();
    expect(document.querySelector(".badge")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /editar descripción/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancelar$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^guardar$/i })).not.toBeInTheDocument();
  });

  it("muestra Guardar al editar y confirma al Cancelar con cambios", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onEditSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ActivoDetalleModal
        open
        activo={activo}
        ubicacion={null}
        categorias={categorias}
        onClose={onClose}
        onEditSubmit={onEditSubmit}
        canWriteAssets
      />,
    );

    expect(screen.getByRole("button", { name: /editar descripción/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /editar descripción/i }));
    const desc = screen.getByLabelText(/^descripción$/i);
    await user.clear(desc);
    await user.type(desc, "Monitor LG");
    await user.click(screen.getByRole("button", { name: /^listo$/i }));

    expect(screen.getByRole("button", { name: /^guardar$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^cancelar$/i }));
    expect(
      screen.getByText(/hay cambios sin guardar/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^descartar$/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onEditSubmit).not.toHaveBeenCalled();
  });

  it("guarda cambios desde la toolbar", async () => {
    const user = userEvent.setup();
    const onEditSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ActivoDetalleModal
        open
        activo={activo}
        ubicacion={null}
        categorias={categorias}
        onClose={vi.fn()}
        onEditSubmit={onEditSubmit}
        canWriteAssets
      />,
    );

    await user.click(screen.getByRole("button", { name: /editar descripción/i }));
    const desc = screen.getByLabelText(/^descripción$/i);
    await user.clear(desc);
    await user.type(desc, "Monitor LG");
    await user.click(screen.getByRole("button", { name: /^listo$/i }));
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => {
      expect(onEditSubmit).toHaveBeenCalledWith(
        "act-1",
        expect.objectContaining({
          numero_patrimonial: "PAT-001",
          descripcion: "Monitor LG",
          categoria_id: "cat-1",
          activo: true,
          serializado: false,
        }),
      );
    });
  });

  it("imprime etiquetas nuevas desde la pestaña Etiquetas", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockImplementation(async (path, opts) => {
      if (typeof path === "string" && path.includes("/imprimir-etiquetas") && opts?.method === "POST") {
        return {
          activo_id: "act-1",
          numero_patrimonial: "PAT-001",
          descripcion: "Notebook Dell",
          cantidad: 2,
          stock_etiquetas: 4,
          etiquetas: [
            { id: "e1", epc: "D10001", serial_hex: "AA", decodificado: { epc: "D10001", valido: true, mensaje: "", del_sistema: true } },
            { id: "e2", epc: "D10002", serial_hex: "BB", decodificado: { epc: "D10002", valido: true, mensaje: "", del_sistema: true } },
          ],
          impreso: true,
          modo_simulacion: true,
          zpl: null,
        };
      }
      if (typeof path === "string" && path.startsWith("/etiquetas")) {
        return [];
      }
      return [];
    });

    render(
      <ActivoDetalleModal
        open
        activo={activo}
        ubicacion={null}
        onClose={vi.fn()}
        canWriteAssets
      />,
    );

    await user.click(screen.getByRole("tab", { name: /^etiquetas$/i }));
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
  });

  it("elimina una etiqueta desde la tabla con confirmación", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockImplementation(async (path, opts) => {
      if (typeof path === "string" && path.startsWith("/etiquetas")) {
        return [
          {
            id: "e1",
            activo_id: "act-1",
            epc: "D10001ABCDEF",
            serial_hex: "AA",
            estado: "activa",
            impresa: true,
            creado_en: "2024-01-01T00:00:00Z",
            impresa_en: "2024-01-01T00:00:00Z",
            numero_patrimonial: "PAT-001",
            descripcion: "Notebook Dell",
            decodificado: null,
          },
        ];
      }
      if (
        typeof path === "string" &&
        path === "/activos/act-1/etiquetas/e1" &&
        opts?.method === "DELETE"
      ) {
        return undefined;
      }
      return [];
    });

    render(
      <ActivoDetalleModal
        open
        activo={activo}
        ubicacion={null}
        onClose={vi.fn()}
        canWriteAssets
        onActivoChanged={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /^etiquetas$/i }));
    await waitFor(() => {
      expect(screen.getByText("D10001ABCDEF")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /eliminar etiqueta d10001abcdef/i }));
    expect(screen.getByText(/dejará de contar en el stock/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^eliminar$/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/activos/act-1/etiquetas/e1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("D10001ABCDEF")).not.toBeInTheDocument();
    });
  });

  it("crea observación cuando hay permiso de escritura", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockImplementation(async (path, opts) => {
      if (typeof path === "string" && path.includes("/observaciones") && opts?.method === "POST") {
        return {
          id: "obs-1",
          activo_id: "act-1",
          usuario_id: "u-1",
          usuario_nombre: "Admin",
          texto: "Nota de prueba",
          creado_en: "2024-07-01T12:00:00Z",
        };
      }
      if (typeof path === "string" && path.endsWith("/observaciones")) {
        return [];
      }
      return [];
    });

    render(
      <ActivoDetalleModal
        open
        activo={activo}
        ubicacion={null}
        onClose={vi.fn()}
        canWriteAssets
      />,
    );

    await user.click(screen.getByRole("tab", { name: /^observaciones$/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/activos/act-1/observaciones",
        expect.anything(),
      );
    });

    expect(screen.getByText(/sin observaciones/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/escribí una nota/i), "Nota de prueba");
    await user.click(screen.getByRole("button", { name: /agregar nota/i }));

    await waitFor(() => {
      expect(screen.getByText("Nota de prueba")).toBeInTheDocument();
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/activos/act-1/observaciones",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ texto: "Nota de prueba" }),
      }),
    );
  });

  it("muestra un solo panel activo al cambiar de pestaña", async () => {
    const user = userEvent.setup();

    render(
      <ActivoDetalleModal
        open
        activo={activo}
        ubicacion={ubicacion}
        onClose={vi.fn()}
      />,
    );

    const detallePanel = document.getElementById(
      screen.getByRole("tab", { name: /^detalle$/i }).getAttribute("aria-controls")!,
    );
    const historialPanel = document.getElementById(
      screen.getByRole("tab", { name: /^historial$/i }).getAttribute("aria-controls")!,
    );

    expect(detallePanel).toHaveClass("is-active");
    expect(historialPanel).not.toHaveClass("is-active");

    await user.click(screen.getByRole("tab", { name: /^historial$/i }));

    expect(historialPanel).toHaveClass("is-active");
    expect(detallePanel).not.toHaveClass("is-active");
  });

  it("muestra historial y movimientos legibles sin UUIDs ni dumps técnicos", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockImplementation(async (path: string) => {
      if (typeof path === "string" && path.includes("/historial")) {
        return [
          {
            id: "h-1",
            activo_id: "act-1",
            usuario_id: "u-1",
            usuario_nombre: "Ana",
            accion: "etiqueta_impresa",
            cambios: {
              cantidad: 2,
              stock_etiquetas: 4,
              modo: "nueva",
              epcs: ["D10001ABCDEF", "D10002ABCDEF"],
            },
            creado_en: "2024-06-01T12:00:00Z",
          },
        ];
      }
      if (typeof path === "string" && path.startsWith("/movimientos")) {
        return {
          items: [
            {
              id: "m-1",
              activo_id: "act-1",
              numero_patrimonial: "PAT-001",
              descripcion: "Notebook Dell",
              usuario_id: "u-1",
              usuario_nombre: "Ana",
              accion: "transferencia",
              cambios: {
                transferencia_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                cantidad: 2,
                deposito_origen: "Depósito Norte",
                deposito_destino: "Depósito Sur",
                ubicacion_codigo: "B-02",
              },
              creado_en: "2024-06-02T12:00:00Z",
            },
          ],
          total: 1,
          limit: 100,
          offset: 0,
        };
      }
      if (typeof path === "string" && path.startsWith("/etiquetas")) return [];
      return null;
    });

    render(
      <ActivoDetalleModal
        open
        activo={activo}
        ubicacion={ubicacion}
        categorias={categorias}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /^historial$/i }));

    await waitFor(() => {
      expect(screen.getByText("Etiquetas impresas")).toBeInTheDocument();
    });
    expect(screen.getByText("2 etiquetas")).toBeInTheDocument();
    expect(screen.getByText("Stock resultante: 4")).toBeInTheDocument();
    expect(screen.getByText("Alta de unidades nuevas")).toBeInTheDocument();
    expect(screen.queryByText(/D10001|"cantidad"/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^actividad$/i }));

    await waitFor(() => {
      expect(screen.getByText("Movimiento a depósito")).toBeInTheDocument();
    });
    expect(screen.getByText("2 unidades")).toBeInTheDocument();
    expect(screen.getByText("Origen: Depósito Norte → Destino: Depósito Sur")).toBeInTheDocument();
    expect(screen.getByText("Ubicación destino: B-02")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ver movimiento/i })).toBeInTheDocument();
    expect(screen.queryByText(/aaaaaaaa/i)).not.toBeInTheDocument();
  });
});
