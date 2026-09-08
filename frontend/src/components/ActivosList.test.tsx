import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivosList from "./ActivosList";
import type { Activo, UbicacionAsignada } from "../types";

const activo: Activo = {
  id: "act-1",
  numero_patrimonial: "PAT-001",
  descripcion: "Notebook",
  categoria_id: "cat-1",
  epc: "E2801",
  datos_tecnicos: null,
  activo: true,
  creado_en: "2024-01-01T00:00:00Z",
  actualizado_en: "2024-01-01T00:00:00Z",
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

describe("ActivosList", () => {
  it("muestra ubicación asignada y dispara acciones", async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    const onUnassign = vi.fn();

    render(
      <ActivosList
        activos={[activo]}
        ubicaciones={{ "act-1": ubicacion }}
        loading={false}
        assigningId={null}
        onAssign={onAssign}
        onUnassign={onUnassign}
      />,
    );

    expect(screen.getByText(/Central \/ Sector A \/ A-01/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cambiar/i }));
    expect(onAssign).toHaveBeenCalledWith("act-1");

    await user.click(screen.getByRole("button", { name: /quitar/i }));
    expect(onUnassign).toHaveBeenCalledWith("act-1");
  });

  it("muestra Sin ubicación cuando no hay asignación", () => {
    render(
      <ActivosList
        activos={[activo]}
        ubicaciones={{ "act-1": null }}
        loading={false}
        assigningId={null}
        onAssign={vi.fn()}
        onUnassign={vi.fn()}
      />,
    );

    expect(screen.getByText("Sin ubicación")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /asignar/i })).toBeInTheDocument();
  });
});
