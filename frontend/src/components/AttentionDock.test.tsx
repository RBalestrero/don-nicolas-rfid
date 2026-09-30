import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttentionDock from "./AttentionDock";
import type { DashboardResumen } from "../types";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api";

const apiFetchMock = vi.mocked(apiFetch);

const resumen: DashboardResumen = {
  kpis: {
    activos_activos: 12,
    depositos_activos: 3,
    inventarios_abiertos: 0,
    transferencias_abiertas: 0,
    stock_total_ubicado: 10,
    activos_sin_ubicacion: 2,
    cobertura_ubicacion_pct: 83,
    inventarios_pendientes_auditoria: 1,
    inventarios_con_discrepancia_pendiente: 1,
    inventarios_activos_pendientes: 0,
    inventarios_avance_pct: 100,
    transferencias_en_transito: 0,
    transferencias_activos_pendientes: 0,
    transferencias_avance_pct: 100,
    discrepancias_inventarios_cerrados: {
      faltantes: 2,
      sobrantes: 0,
      inventarios_con_discrepancia: 1,
    },
  },
  stock_por_deposito: [],
  movimientos_recientes: [],
  transferencias_recientes: [],
  inventarios_recientes: [
    {
      id: "inv-1",
      deposito_id: "dep-2",
      deposito_nombre: "Sur",
      estado: "cerrado",
      auditado: false,
      total_esperado: 10,
      total_encontrado: 8,
      total_faltante: 2,
      total_sobrante: 0,
      total_exceso: 0,
      iniciado_en: "2024-06-01T10:00:00Z",
      cerrado_en: "2024-06-01T11:00:00Z",
    },
  ],
  movimientos_limit: 1,
  ops_limit: 12,
};

describe("AttentionDock", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    sessionStorage.clear();
    localStorage.clear();
    apiFetchMock.mockImplementation(async (path: string) => {
      if (String(path).startsWith("/dashboard/resumen")) return resumen;
      throw new Error(`Unexpected path: ${path}`);
    });
  });

  it("lista ítems de atención y navega con filtro", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onCountChange = vi.fn();

    render(
      <AttentionDock
        onNavigate={onNavigate}
        onCountChange={onCountChange}
        mobileOpen={false}
        onMobileOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("Requiere atención")).toBeInTheDocument();
    expect(screen.getByText(/Inventario · Sur/i)).toBeInTheDocument();
    expect(screen.getByText(/2 activos sin ubicación/i)).toBeInTheDocument();
    await waitForCount(onCountChange);

    await user.click(screen.getByRole("button", { name: /Inventario · Sur/i }));
    expect(onNavigate).toHaveBeenCalledWith("inventarios");
    expect(sessionStorage.getItem("dn_inv_filter")).toBe("discrepancias");
  });

  it("muestra empty state sin pendientes", async () => {
    apiFetchMock.mockImplementation(async () => ({
      ...resumen,
      kpis: {
        ...resumen.kpis,
        activos_sin_ubicacion: 0,
        cobertura_ubicacion_pct: 100,
        inventarios_pendientes_auditoria: 0,
        inventarios_con_discrepancia_pendiente: 0,
        stock_total_ubicado: 12,
      },
      inventarios_recientes: [],
    }));

    render(
      <AttentionDock
        onNavigate={vi.fn()}
        mobileOpen={false}
        onMobileOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("Todo en orden")).toBeInTheDocument();
  });
});

async function waitForCount(onCountChange: ReturnType<typeof vi.fn>) {
  const { waitFor } = await import("@testing-library/react");
  await waitFor(() => {
    expect(onCountChange).toHaveBeenCalled();
    const calls = onCountChange.mock.calls;
    const last = calls[calls.length - 1]?.[0];
    expect(last).toBeGreaterThan(0);
  });
}
