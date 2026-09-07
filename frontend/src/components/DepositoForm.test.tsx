import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DepositoForm from "./DepositoForm";

describe("DepositoForm", () => {
  it("renderiza los campos del formulario", () => {
    render(<DepositoForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/^nombre$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dirección/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear depósito/i })).toBeInTheDocument();
  });

  it("envía los datos al hacer submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<DepositoForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/^nombre$/i), "Depósito Central");
    await user.type(screen.getByLabelText(/descripción/i), "Planta principal");
    await user.type(screen.getByLabelText(/dirección/i), "Av. Principal 123");
    await user.click(screen.getByRole("button", { name: /crear depósito/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        nombre: "Depósito Central",
        descripcion: "Planta principal",
        direccion: "Av. Principal 123",
      });
    });
  });
});
