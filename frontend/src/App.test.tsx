import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";

vi.stubGlobal("fetch", vi.fn());

function renderApp() {
  return render(
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    sessionStorage.clear();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok", database: "connected" }),
    } as Response);
  });

  it("renderiza el título del sistema", async () => {
    renderApp();
    expect(screen.getByText("Don Nicolás")).toBeInTheDocument();
    expect(await screen.findByText(/iniciar sesión/i)).toBeInTheDocument();
  });
});
