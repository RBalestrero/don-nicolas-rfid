import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransferenciasPage from "./TransferenciasPage";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api";

const apiFetchMock = vi.mocked(apiFetch);

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
  {
    id: "dep-2",
    nombre: "Sur",
    descripcion: null,
    direccion: null,
    activo: true,
    creado_en: "2024-01-01T00:00:00Z",
    actualizado_en: "2024-01-01T00:00:00Z",
  },
];

const stock = {
  deposito_id: "dep-1",
  deposito_nombre: "Central",
  total: 1,
  activos: [
    {
      activo_id: "act-1",
      numero_patrimonial: "PAT-1",
      descripcion: "Notebook",
      categoria_id: "cat-1",
      categoria_nombre: "IT",
      epc: "E280AAA",
      ubicacion_id: "ubi-1",
      ubicacion_codigo: "A-01",
      sector_id: "sec-1",
      sector_nombre: "Sector A",
    },
  ],
};

const destinoDetalle = {
  ...depositos[1],
  sectores: [
    {
      id: "sec-2",
      deposito_id: "dep-2",
      nombre: "Sector Sur",
      descripcion: null,
      activo: true,
      creado_en: "2024-01-01T00:00:00Z",
      actualizado_en: "2024-01-01T00:00:00Z",
      ubicaciones: [
        {
          id: "ubi-2",
          sector_id: "sec-2",
          codigo: "S-01",
          descripcion: null,
          activo: true,
          creado_en: "2024-01-01T00:00:00Z",
          actualizado_en: "2024-01-01T00:00:00Z",
        },
      ],
    },
  ],
};

const transferencia = {
  id: "xfer-1",
  deposito_origen_id: "dep-1",
  deposito_destino_id: "dep-2",
  ubicacion_destino_id: "ubi-2",
  usuario_id: "u-1",
  estado: "pendiente",
  notas: null,
  total_activos: 1,
  confirmados_origen: 0,
  confirmados_destino: 0,
  creado_en: "2024-06-01T12:00:00Z",
  enviado_en: null,
  completado_en: null,
  detalles: [
    {
      id: "det-1",
      activo_id: "act-1",
      epc: "E280AAA",
      numero_patrimonial: "PAT-1",
      descripcion: "Notebook",
      ubicacion_origen_id: "ubi-1",
      confirmado_origen: false,
      confirmado_destino: false,
    },
  ],
};

describe("TransferenciasPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/depositos") return depositos;
      if (path.startsWith("/transferencias?") || path === "/transferencias") {
        if (options?.method === "POST") return transferencia;
        return [transferencia];
      }
      if (path === "/depositos/dep-1/stock") return stock;
      if (path === "/depositos/dep-2") return destinoDetalle;
      if (path === "/depositos/dep-1") {
        return {
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
      if (path === "/transferencias/xfer-1/confirmar-origen") {
        return { ...transferencia, estado: "en_transito", confirmados_origen: 1 };
      }
      throw new Error(`Unexpected path: ${path}`);
    });
  });

  it("crea una transferencia y confirma origen con EPCs", async () => {
    const user = userEvent.setup();
    render(<TransferenciasPage />);

    expect(await screen.findByText(/PAT-1/)).toBeInTheDocument();

    const destinoSelect = screen.getByLabelText(/depósito destino/i);
    await user.selectOptions(destinoSelect, "dep-2");

    await waitFor(() => {
      expect(screen.getByLabelText(/ubicación destino/i)).toHaveValue("ubi-2");
    });

    await user.click(screen.getByRole("checkbox", { name: /PAT-1/i }));
    await user.click(screen.getByRole("button", { name: /crear transferencia/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/transferencias",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"activo_ids":["act-1"]'),
        }),
      );
    });

    expect(await screen.findByText(/Transferencia — Pendiente/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /completar con epcs/i }));
    await user.click(screen.getByRole("button", { name: /confirmar origen/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/transferencias/xfer-1/confirmar-origen",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ epcs: ["E280AAA"] }),
        }),
      );
    });

    expect(await screen.findByRole("heading", { name: /Transferencia — En tránsito/i })).toBeInTheDocument();
  });
});
