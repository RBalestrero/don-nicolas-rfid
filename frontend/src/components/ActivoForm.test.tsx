import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivoForm from "./ActivoForm";
import type { Categoria } from "../types";

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

describe("ActivoForm", () => {
  it("renderiza los campos del formulario", () => {
    render(<ActivoForm categorias={categoriasMock} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/número patrimonial/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^descripción$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^categoría$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dar de alta activo/i })).toBeInTheDocument();
  });

  it("envía los datos al hacer submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ActivoForm categorias={categoriasMock} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/número patrimonial/i), "PAT-001");
    await user.type(screen.getByLabelText(/^descripción$/i), "Notebook Dell");
    await user.click(screen.getByRole("button", { name: /dar de alta activo/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        numero_patrimonial: "PAT-001",
        descripcion: "Notebook Dell",
        categoria_id: "cat-1",
        epc: null,
        datos_tecnicos: null,
      });
    });
  });

  it("muestra error si el JSON de datos técnicos es inválido", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<ActivoForm categorias={categoriasMock} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/número patrimonial/i), "PAT-002");
    await user.type(screen.getByLabelText(/^descripción$/i), "Monitor");
    await user.type(screen.getByLabelText(/datos técnicos/i), "{{invalid}}");
    await user.click(screen.getByRole("button", { name: /dar de alta activo/i }));

    expect(await screen.findByText(/json válido/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
