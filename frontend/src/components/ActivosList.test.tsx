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

const noopHandlers = {
  onAssign: vi.fn(),
  onUnassign: vi.fn(),
  onEdit: vi.fn(),
  onHistorial: vi.fn(),
  onFotos: vi.fn(),
  onDeactivate: vi.fn(),
};

describe("ActivosList", () => {
  it("muestra ubicación asignada y dispara acciones densas", async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    const onUnassign = vi.fn();
    const onEdit = vi.fn();
    const onHistorial = vi.fn();
    const onFotos = vi.fn();
    const onDeactivate = vi.fn();

    render(
      <ActivosList
        activos={[activo]}
        ubicaciones={{ "act-1": ubicacion }}
        loading={false}
        assigningId={null}
        editingId={null}
        historialId={null}
        fotosId={null}
        onAssign={onAssign}
        onUnassign={onUnassign}
        onEdit={onEdit}
        onHistorial={onHistorial}
        onFotos={onFotos}
        onDeactivate={onDeactivate}
      />,
    );

    expect(screen.getByText(/Central \/ Sector A \/ A-01/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^ubicación$/i }));
    expect(onAssign).toHaveBeenCalledWith("act-1");

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    expect(onEdit).toHaveBeenCalledWith("act-1");

    await user.click(screen.getByRole("button", { name: /más acciones de pat-001/i }));
    await user.click(screen.getByRole("menuitem", { name: /^fotos$/i }));
    expect(onFotos).toHaveBeenCalledWith("act-1");

    await user.click(screen.getByRole("button", { name: /más acciones de pat-001/i }));
    await user.click(screen.getByRole("menuitem", { name: /^historial$/i }));
    expect(onHistorial).toHaveBeenCalledWith("act-1");

    await user.click(screen.getByRole("button", { name: /más acciones de pat-001/i }));
    await user.click(screen.getByRole("menuitem", { name: /quitar ubicación/i }));
    expect(onUnassign).toHaveBeenCalledWith("act-1");

    await user.click(screen.getByRole("button", { name: /más acciones de pat-001/i }));
    await user.click(screen.getByRole("menuitem", { name: /dar de baja/i }));
    expect(onDeactivate).toHaveBeenCalledWith("act-1");
  });

  it("muestra Sin ubicación cuando no hay asignación", () => {
    render(
      <ActivosList
        activos={[activo]}
        ubicaciones={{ "act-1": null }}
        loading={false}
        assigningId={null}
        editingId={null}
        historialId={null}
        fotosId={null}
        {...noopHandlers}
      />,
    );

    expect(screen.getByText("Sin ubicación")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /asignar/i })).toBeInTheDocument();
  });
});
