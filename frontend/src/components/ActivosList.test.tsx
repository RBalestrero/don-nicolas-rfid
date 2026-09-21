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
  epc: null,
  datos_tecnicos: null,
  activo: true,
  creado_en: "2024-01-01T00:00:00Z",
  actualizado_en: "2024-01-01T00:00:00Z",
  stock_etiquetas: 3,
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
  onView: vi.fn(),
  onEdit: vi.fn(),
  onPrint: vi.fn(),
  onDelete: vi.fn(),
};

describe("ActivosList", () => {
  it("muestra Ver como acción primaria y menú Más con Editar / Imprimir / Eliminar", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const onEdit = vi.fn();
    const onPrint = vi.fn();
    const onDelete = vi.fn();

    render(
      <ActivosList
        activos={[activo]}
        ubicaciones={{ "act-1": ubicacion }}
        loading={false}
        onView={onView}
        onEdit={onEdit}
        onPrint={onPrint}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText(/Central \/ Sector A \/ A-01/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^ubicación$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^editar$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^ver$/i }));
    expect(onView).toHaveBeenCalledWith("act-1");

    await user.click(screen.getByRole("button", { name: /más acciones de pat-001/i }));
    await user.click(screen.getByRole("menuitem", { name: /^editar$/i }));
    expect(onEdit).toHaveBeenCalledWith("act-1");

    await user.click(screen.getByRole("button", { name: /más acciones de pat-001/i }));
    await user.click(screen.getByRole("menuitem", { name: /imprimir etiqueta/i }));
    expect(onPrint).toHaveBeenCalledWith("act-1");

    await user.click(screen.getByRole("button", { name: /más acciones de pat-001/i }));
    await user.click(screen.getByRole("menuitem", { name: /^eliminar$/i }));
    expect(onDelete).toHaveBeenCalledWith("act-1");
  });

  it("oculta menú Más sin permiso de escritura y muestra Sin ubicación", () => {
    render(
      <ActivosList
        activos={[activo]}
        ubicaciones={{ "act-1": null }}
        loading={false}
        canWriteAssets={false}
        {...noopHandlers}
      />,
    );

    expect(screen.getByText("Sin ubicación")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^ver$/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /más acciones de pat-001/i }),
    ).not.toBeInTheDocument();
  });
});
