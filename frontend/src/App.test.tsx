import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renderiza el título del sistema", () => {
    render(<App />);
    expect(screen.getByText("Don Nicolás")).toBeInTheDocument();
    expect(screen.getByText(/Sistema de Gestión de Activos/i)).toBeInTheDocument();
  });
});
