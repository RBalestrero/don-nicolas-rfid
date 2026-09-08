import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  it("muestra título, pasos y acción", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Sin activos"
        description="Empezá por el alta patrimonial."
        steps={["Creá una categoría", "Alta el activo", "Asigná ubicación"]}
        action={
          <button type="button" onClick={onClick}>
            + Nuevo activo
          </button>
        }
      />,
    );

    expect(screen.getByText("Sin activos")).toBeInTheDocument();
    expect(screen.getByText(/empezá por el alta/i)).toBeInTheDocument();
    expect(screen.getByText("Creá una categoría")).toBeInTheDocument();
    expect(screen.getByText("Asigná ubicación")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /\+ nuevo activo/i }));
    expect(onClick).toHaveBeenCalled();
  });
});
