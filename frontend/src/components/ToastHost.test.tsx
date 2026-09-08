import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "../context/ToastContext";
import ToastHost from "./ToastHost";

function Probe() {
  const toast = useToast();
  return (
    <div>
      <button type="button" onClick={() => toast.success("Activo creado")}>
        ok
      </button>
      <button type="button" onClick={() => toast.error("Falló la operación")}>
        fail
      </button>
      <ToastHost />
    </div>
  );
}

describe("ToastHost", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("muestra y descarta un toast de éxito", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: /^ok$/i }));
    expect(screen.getByText("Activo creado")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cerrar aviso/i }));
    expect(screen.queryByText("Activo creado")).not.toBeInTheDocument();
  });

  it("auto-cierra toasts de éxito", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: /^ok$/i }));
    expect(screen.getByText("Activo creado")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText("Activo creado")).not.toBeInTheDocument();
  });
});
