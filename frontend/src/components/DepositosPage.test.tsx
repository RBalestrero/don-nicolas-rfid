import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DepositosPage from "./DepositosPage";

vi.stubGlobal("fetch", vi.fn());

function mockJson(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => data,
  } as Response;
}

describe("DepositosPage", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    sessionStorage.setItem("don_nicolas_token", "test-token");
  });

  it("renderiza listado y permite crear un depósito", async () => {
    const user = userEvent.setup();
    const deposito = {
      id: "dep-1",
      nombre: "Depósito Central",
      descripcion: null,
      direccion: null,
      activo: true,
      creado_en: "2024-01-01T00:00:00Z",
      actualizado_en: "2024-01-01T00:00:00Z",
    };

    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/depositos") && method === "GET" && !url.includes("include_tree") && !url.includes("/stock")) {
        return mockJson([]);
      }
      if (url.includes("/depositos") && method === "POST") {
        return mockJson(deposito, 201);
      }
      if (url.includes("include_tree=true")) {
        return mockJson({ ...deposito, sectores: [] });
      }
      if (url.includes("/stock")) {
        return mockJson({
          deposito_id: deposito.id,
          deposito_nombre: deposito.nombre,
          total: 0,
          activos: [],
        });
      }
      return mockJson([]);
    });

    render(<DepositosPage />);

    expect(await screen.findByRole("heading", { name: /^depósitos$/i })).toBeInTheDocument();
    expect(await screen.findByText(/sin depósitos/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /\+ nuevo depósito/i })[0]);
    await user.type(screen.getByLabelText(/^nombre$/i), "Depósito Central");
    await user.click(screen.getByRole("button", { name: /crear depósito/i }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining("/depositos"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
