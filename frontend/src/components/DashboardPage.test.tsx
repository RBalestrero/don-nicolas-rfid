import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardPage from "./DashboardPage";
import type { DashboardResumen, MovimientosPage } from "../types";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api";

const apiFetchMock = vi.mocked(apiFetch);

const resumen: DashboardResumen = {
  kpis: {
    activos_activos: 12,
    depositos_activos: 3,
    inventarios_abiertos: 1,
    transferencias_abiertas: 2,
    stock_total_ubicado: 10,
    discrepancias_inventarios_cerrados: {
      faltantes: 4,
      sobrantes: 1,
      inventarios_con_discrepancia: 2,
    },
  },
  stock_por_deposito: [
    { deposito_id: "dep-1", deposito_nombre: "Central", total: 7 },
    { deposito_id: "dep-2", deposito_nombre: "Sur", total: 3 },
  ],
  movimientos_recientes: [
    {
      id: "m-1",
      activo_id: "act-1",
      numero_patrimonial: "PAT-100",
      descripcion: "Notebook",
      usuario_id: "u-1",
      usuario_nombre: "Admin",
      accion: "creacion",
      cambios: null,
      creado_en: "2024-06-01T12:00:00Z",
    },
  ],
  transferencias_recientes: [
    {
      id: "t-1",
      deposito_origen_id: "dep-1",
      deposito_origen_nombre: "Central",
      deposito_destino_id: "dep-2",
      deposito_destino_nombre: "Sur",
      estado: "pendiente",
      total_activos: 2,
      confirmados_origen: 0,
      confirmados_destino: 0,
      creado_en: "2024-06-02T12:00:00Z",
    },
  ],
  inventarios_recientes: [
    {
      id: "i-1",
      deposito_id: "dep-1",
      deposito_nombre: "Central",
      estado: "en_curso",
      total_esperado: 10,
      total_encontrado: 3,
      total_faltante: 0,
      total_sobrante: 0,
      iniciado_en: "2024-06-01T10:00:00Z",
      cerrado_en: null,
    },
  ],
  movimientos_limit: 20,
  ops_limit: 10,
};

const movimientosPage: MovimientosPage = {
  total: 1,
  limit: 50,
  offset: 0,
  items: [
    {
      id: "m-2",
      activo_id: "act-2",
      numero_patrimonial: "PAT-200",
      descripcion: "Monitor",
      usuario_id: null,
      usuario_nombre: null,
      accion: "transferencia",
      cambios: null,
      creado_en: "2024-06-03T12:00:00Z",
    },
  ],
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/dashboard/resumen")) return resumen;
      if (path.startsWith("/movimientos")) return movimientosPage;
      throw new Error(`Unexpected path: ${path}`);
    });
  });

  it("muestra KPIs operativos y filtra actividad", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<DashboardPage onNavigate={onNavigate} />);

    expect(await screen.findByText("Transferencias abiertas")).toBeInTheDocument();
    expect(screen.getByText("Inventarios abiertos")).toBeInTheDocument();
    expect(screen.getByText("Discrepancias")).toBeInTheDocument();
    expect(screen.getByText("Sin ubicación")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /transferencias abiertas/i })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /sin ubicación/i })).toHaveTextContent("2");
    expect(screen.getByText(/Central → Sur/)).toBeInTheDocument();
    expect(screen.getByText(/PAT-100/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /transferencias abiertas/i }));
    expect(onNavigate).toHaveBeenCalledWith("transferencias");

    await user.selectOptions(screen.getByLabelText(/^acción$/i), "transferencia");
    await user.click(screen.getByRole("button", { name: /^filtrar$/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining("/movimientos?"));
    });

    expect(await screen.findByText(/PAT-200/)).toBeInTheDocument();
    expect(screen.getByText(/1 resultado/)).toBeInTheDocument();
  });

  it("muestra guía de puesta en marcha cuando el sistema está vacío", async () => {
    const onNavigate = vi.fn();
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/dashboard/resumen")) {
        return {
          ...resumen,
          kpis: {
            ...resumen.kpis,
            activos_activos: 0,
            depositos_activos: 0,
            inventarios_abiertos: 0,
            transferencias_abiertas: 0,
            stock_total_ubicado: 0,
            discrepancias_inventarios_cerrados: {
              faltantes: 0,
              sobrantes: 0,
              inventarios_con_discrepancia: 0,
            },
          },
          stock_por_deposito: [],
          movimientos_recientes: [],
          transferencias_recientes: [],
          inventarios_recientes: [],
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    const user = userEvent.setup();
    render(<DashboardPage onNavigate={onNavigate} />);

    expect(await screen.findByText("Puesta en marcha")).toBeInTheDocument();
    expect(screen.getByText(/creá depósitos con sectores/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ir a depósitos/i }));
    expect(onNavigate).toHaveBeenCalledWith("depositos");
  });
});
