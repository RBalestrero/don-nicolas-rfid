import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategoriaForm from "./CategoriaForm";

describe("CategoriaForm", () => {
  it("renderiza y envía una nueva categoría", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<CategoriaForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/^nombre$/i), "Mobiliario");
    await user.type(screen.getByLabelText(/descripción/i), "Sillas y mesas");
    await user.click(screen.getByRole("button", { name: /crear categoría/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        nombre: "Mobiliario",
        descripcion: "Sillas y mesas",
      });
    });
  });
});
