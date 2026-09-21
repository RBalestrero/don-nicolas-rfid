import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ActivoHistorial from "./ActivoHistorial";
import type { HistorialEntry } from "../types";

const entries: HistorialEntry[] = [
  {
    id: "h-1",
    activo_id: "act-1",
    usuario_id: "u-1",
    usuario_nombre: "Admin",
    accion: "actualizacion",
    cambios: {
      descripcion: { anterior: "Viejo", nuevo: "Nuevo" },
    },
    creado_en: "2024-06-01T12:00:00Z",
  },
  {
    id: "h-2",
    activo_id: "act-1",
    usuario_id: null,
    usuario_nombre: null,
    accion: "creacion",
    cambios: null,
    creado_en: "2024-05-01T10:00:00Z",
  },
];

describe("ActivoHistorial", () => {
  it("muestra eventos legibles sin dumps técnicos", () => {
    render(<ActivoHistorial entries={entries} loading={false} />);

    expect(screen.getByText("Datos actualizados")).toBeInTheDocument();
    expect(screen.getByText("Alta del artículo")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Sistema")).toBeInTheDocument();
    expect(screen.getByText("Descripción: Viejo → Nuevo")).toBeInTheDocument();
    expect(screen.queryByText(/JSON|uuid|"Viejo"/i)).not.toBeInTheDocument();
  });

  it("muestra estado vacío", () => {
    render(<ActivoHistorial entries={[]} loading={false} />);
    expect(screen.getByText(/todavía no hay eventos/i)).toBeInTheDocument();
  });
});
