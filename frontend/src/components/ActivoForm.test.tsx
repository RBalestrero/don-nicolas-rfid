import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivoForm from "./ActivoForm";
import type { Activo, Categoria } from "../types";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api";

const apiFetchMock = vi.mocked(apiFetch);

const categoriasMock: Categoria[] = [
  {
    id: "cat-1",
    nombre: "Informática",
    descripcion: null,
    activa: true,
    creado_en: "2024-01-01T00:00:00Z",
    actualizado_en: "2024-01-01T00:00:00Z",
  },
];

const activoInicial: Activo = {
  id: "act-1",
  numero_patrimonial: "PAT-001",
  descripcion: "Notebook Dell",
  categoria_id: "cat-1",
  epc: "E2801",
  datos_tecnicos: { marca: "Dell" },
  activo: true,
  creado_en: "2024-01-01T00:00:00Z",
  actualizado_en: "2024-01-01T00:00:00Z",
  categoria: categoriasMock[0],
};

describe("ActivoForm", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/depositos") {
        return [
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
      }
      if (path.startsWith("/depositos/dep-1")) {
        return {
          id: "dep-1",
          nombre: "Central",
          descripcion: null,
          direccion: null,
          activo: true,
          creado_en: "2024-01-01T00:00:00Z",
          actualizado_en: "2024-01-01T00:00:00Z",
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
                  descripcion: null,
                  activo: true,
                  creado_en: "2024-01-01T00:00:00Z",
                  actualizado_en: "2024-01-01T00:00:00Z",
                },
              ],
            },
          ],
        };
      }
      throw new Error(`Unexpected path ${path}`);
    });
  });

  it("renderiza alta sin EPC ni JSON y con ubicación", async () => {
    render(<ActivoForm categorias={categoriasMock} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/número patrimonial/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^descripción$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^categoría$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/epc/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/datos técnicos/i)).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/^depósito$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dar de alta artículo/i })).toBeInTheDocument();
  });

  it("envía alta con ubicación", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ActivoForm categorias={categoriasMock} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/número patrimonial/i), "PAT-001");
    await user.type(screen.getByLabelText(/^descripción$/i), "Notebook Dell");

    const deposito = await screen.findByLabelText(/^depósito$/i);
    await user.selectOptions(deposito, "dep-1");
    const sector = await screen.findByLabelText(/^sector$/i);
    await waitFor(() => expect(sector).not.toBeDisabled());
    await user.selectOptions(sector, "sec-1");
    const ubicacion = screen.getByLabelText(/^ubicación$/i);
    await waitFor(() => expect(ubicacion).not.toBeDisabled());
    await user.selectOptions(ubicacion, "ubi-1");

    await user.click(screen.getByRole("button", { name: /dar de alta artículo/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        numero_patrimonial: "PAT-001",
        descripcion: "Notebook Dell",
        categoria_id: "cat-1",
        serializado: false,
        ubicacion_id: "ubi-1",
        epc: null,
        datos_tecnicos: null,
      });
    });
  });

  it("prefilla y envía cambios en modo edición sin pedir ubicación", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ActivoForm
        categorias={categoriasMock}
        initial={activoInicial}
        onSubmit={onSubmit}
        submitLabel="Guardar cambios"
      />,
    );

    expect(screen.getByDisplayValue("PAT-001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Notebook Dell")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^depósito$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/epc/i)).not.toBeInTheDocument();

    const descripcion = screen.getByLabelText(/^descripción$/i);
    await user.clear(descripcion);
    await user.type(descripcion, "Notebook actualizada");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        numero_patrimonial: "PAT-001",
        descripcion: "Notebook actualizada",
        categoria_id: "cat-1",
        serializado: false,
      });
    });
  });
});
