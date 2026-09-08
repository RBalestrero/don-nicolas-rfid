import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AsignacionUbicacionForm from "./AsignacionUbicacionForm";

const depositos = [
  {
    id: "dep-1",
    nombre: "Central",
    descripcion: null,
    direccion: null,
    activo: true,
    creado_en: "2024-01-01T00:00:00Z",
    actualizado_en: "2024-01-01T00:00:00Z",
  },
];

const detalle = {
  ...depositos[0],
  sectores: [
    {
      id: "sec-1",
      deposito_id: "dep-1",
      nombre: "Sector A",
      descripcion: null,
      activo: true,
      creado_en: "2024-01-01T00:00:00Z",
      actualizado_en: "2024-01-01T00:00:00Z",
      ubicaciones: [
        {
          id: "ubi-1",
          sector_id: "sec-1",
          codigo: "A-01",
          descripcion: "Estante 1",
          activo: true,
          creado_en: "2024-01-01T00:00:00Z",
          actualizado_en: "2024-01-01T00:00:00Z",
        },
      ],
    },
  ],
};

describe("AsignacionUbicacionForm", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/depositos") && !url.includes("include_tree")) {
          return {
            ok: true,
            status: 200,
            json: async () => depositos,
          };
        }
        if (url.includes("include_tree=true")) {
          return {
            ok: true,
            status: 200,
            json: async () => detalle,
          };
        }
        return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("envía ubicacion_id tras la cascada depósito/sector/ubicación", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<AsignacionUbicacionForm onSubmit={onSubmit} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^depósito$/i)).toBeEnabled();
    });

    await user.selectOptions(screen.getByLabelText(/^depósito$/i), "dep-1");

    await waitFor(() => {
      expect(screen.getByLabelText(/^sector$/i)).toBeEnabled();
    });
    await user.selectOptions(screen.getByLabelText(/^sector$/i), "sec-1");

    await waitFor(() => {
      expect(screen.getByLabelText(/^ubicación$/i)).toBeEnabled();
    });
    await user.selectOptions(screen.getByLabelText(/^ubicación$/i), "ubi-1");

    await user.click(screen.getByRole("button", { name: /asignar ubicación/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ ubicacion_id: "ubi-1" });
    });
  });
});
