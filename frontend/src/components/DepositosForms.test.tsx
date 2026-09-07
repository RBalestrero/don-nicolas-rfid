import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SectorForm from "./SectorForm";
import UbicacionForm from "./UbicacionForm";
import type { Sector } from "../types";

const sectoresMock: Sector[] = [
  {
    id: "sec-1",
    deposito_id: "dep-1",
    nombre: "Sector A",
    descripcion: null,
    activo: true,
    creado_en: "2024-01-01T00:00:00Z",
    actualizado_en: "2024-01-01T00:00:00Z",
  },
];

describe("SectorForm", () => {
  it("renderiza y envía un nuevo sector", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<SectorForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/nombre del sector/i), "Sector B");
    await user.type(screen.getByLabelText(/descripción/i), "Herramientas");
    await user.click(screen.getByRole("button", { name: /crear sector/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        nombre: "Sector B",
        descripcion: "Herramientas",
      });
    });
  });
});

describe("UbicacionForm", () => {
  it("renderiza y envía una nueva ubicación", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<UbicacionForm sectores={sectoresMock} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/^código$/i), "A-01");
    await user.type(screen.getByLabelText(/descripción/i), "Estante 1");
    await user.click(screen.getByRole("button", { name: /crear ubicación/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("sec-1", {
        codigo: "A-01",
        descripcion: "Estante 1",
      });
    });
  });
});
