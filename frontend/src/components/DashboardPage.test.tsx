import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardPage from "./DashboardPage";
import type { DashboardResumen, MovimientosPage } from "../types";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../lib/usePermissions", () => ({
  usePermissions: () => ({
    rol: "admin",
    roleLabel: "Admin",
    canWriteAssets: true,
    canWriteAssignment: true,
    canWriteWarehouse: true,
    canWriteTransfer: true,
    canCancelTransfer: true,
    canManageUsers: true,
    canManageRoles: true,
  }),
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
    activos_sin_ubicacion: 2,
    cobertura_ubicacion_pct: 83,
    inventarios_pendientes_auditoria: 3,
    inventarios_con_discrepancia_pendiente: 2,
    inventarios_activos_pendientes: 7,
    inventarios_avance_pct: 30,
    transferencias_en_transito: 1,
    transferencias_activos_pendientes: 2,
    transferencias_avance_pct: 0,
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
      auditado: false,
      iniciado_en: "2024-06-01T10:00:00Z",
      cerrado_en: null,
    },
    {
      id: "i-2",
      deposito_id: "dep-2",
      deposito_nombre: "Sur",
      estado: "cerrado",
      total_esperado: 8,
      total_encontrado: 5,
      total_faltante: 3,
      total_sobrante: 1,
      auditado: false,
      iniciado_en: "2024-05-28T10:00:00Z",
      cerrado_en: "2024-05-28T18:00:00Z",
    },
    {
      id: "i-3",
      deposito_id: "dep-3",
      deposito_nombre: "Norte",
      estado: "cerrado",
      total_esperado: 6,
      total_encontrado: 4,
      total_faltante: 2,
      total_sobrante: 0,
      auditado: true,
      iniciado_en: "2024-05-20T10:00:00Z",
      cerrado_en: "2024-05-20T18:00:00Z",
    },
  ],
  dispositivos_moviles: [
    {
      id: "dev-1",
      modelo: "MC3300x",
      fabricante: "Zebra Technologies",
      numero_serie: "SN998877",
      app_version: "0.1.0",
      android_version: "11",
      usuario_id: "u-1",
      usuario_nombre: "Operador Depósito",
      ultimo_visto_en: new Date().toISOString(),
      registrado_en: "2024-06-01T10:00:00Z",
      sesion_activa: true,
      en_linea: true,
      estado: "en_linea",
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

    expect(await screen.findByText("Ejecución de movimientos")).toBeInTheDocument();
    expect(screen.getByText("Avance de inventarios")).toBeInTheDocument();
    expect(screen.getByText("Auditoría pendiente")).toBeInTheDocument();
    expect(screen.getByText("Cobertura de ubicación")).toBeInTheDocument();
    expect(screen.queryByText(/hay discrepancias para revisar/i)).not.toBeInTheDocument();
    expect(screen.getByText("Requiere atención")).toBeInTheDocument();
    expect(screen.getByText(/Inventario · Sur/i)).toBeInTheDocument();
    expect(screen.getByText(/2 activos sin ubicación/i)).toBeInTheDocument();
    expect(screen.queryByText(/Inventario · Norte/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ejecución de movimientos/i })).toHaveTextContent("0%");
    expect(screen.getByRole("button", { name: /^cobertura de ubicación/i })).toHaveTextContent("83%");
    expect(screen.getByText("2 sin ubicar")).toBeInTheDocument();
    expect(screen.getByText("10/12 ubicados")).toBeInTheDocument();
    expect(screen.getByText(/2 activos por recibir/i)).toBeInTheDocument();
    expect(screen.getByText(/7 activos por relevar/i)).toBeInTheDocument();
    expect(screen.getByText(/Central → Sur/)).toBeInTheDocument();
    expect(screen.getByText(/Confirmados en destino 0\/2/)).toBeInTheDocument();
    expect(screen.getByText(/Leídos 3\/10 esperados/)).toBeInTheDocument();
    expect(screen.getByText(/PAT-100/)).toBeInTheDocument();
    expect(screen.getByText("Dispositivos MC33")).toBeInTheDocument();
    expect(screen.getByText(/MC3300x · S\/N SN998877/)).toBeInTheDocument();
    expect(screen.getByText("En línea")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ver detalle de alta · pat-100/i }));
    expect(onNavigate).toHaveBeenCalledWith("activos");
    expect(sessionStorage.getItem("dn_act_focus")).toBe("act-1");
    expect(sessionStorage.getItem("dn_act_search")).toBe("PAT-100");
    sessionStorage.removeItem("dn_act_focus");
    sessionStorage.removeItem("dn_act_search");

    await user.click(screen.getByRole("button", { name: /Inventario · Sur/i }));
    expect(onNavigate).toHaveBeenCalledWith("inventarios");
    expect(sessionStorage.getItem("dn_inv_filter")).toBe("discrepancias");
    sessionStorage.removeItem("dn_inv_filter");

    await user.click(screen.getByRole("button", { name: /ejecución de movimientos/i }));
    expect(onNavigate).toHaveBeenCalledWith("transferencias");
    expect(sessionStorage.getItem("dn_xfer_filter")).toBe("abiertas");
    sessionStorage.removeItem("dn_xfer_filter");

    await user.click(screen.getByRole("button", { name: /auditoría pendiente/i }));
    expect(sessionStorage.getItem("dn_inv_filter")).toBe("pendiente_auditoria");
    sessionStorage.removeItem("dn_inv_filter");

    await user.click(screen.getByRole("button", { name: /avance de inventarios/i }));
    expect(sessionStorage.getItem("dn_inv_filter")).toBe("en_curso");
    sessionStorage.removeItem("dn_inv_filter");

    await user.selectOptions(screen.getByLabelText(/^acción$/i), "transferencia");
    await user.click(screen.getByRole("button", { name: /^filtrar$/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining("/movimientos?"));
    });

    expect(await screen.findByText(/PAT-200/)).toBeInTheDocument();
    expect(screen.getByText(/1 resultado/)).toBeInTheDocument();
  });

  it("muestra Inactivo y Sesión cerrada en dispositivos MC33", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/dashboard/resumen")) {
        return {
          ...resumen,
          dispositivos_moviles: [
            {
              id: "dev-idle",
              modelo: "MC3300x",
              fabricante: "Zebra Technologies",
              numero_serie: "SN-IDLE",
              app_version: "0.1.0",
              android_version: "11",
              usuario_id: "u-1",
              usuario_nombre: "Operador",
              ultimo_visto_en: new Date(Date.now() - 5 * 60_000).toISOString(),
              registrado_en: "2024-06-01T10:00:00Z",
              sesion_activa: true,
              en_linea: false,
              estado: "inactivo",
            },
            {
              id: "dev-off",
              modelo: "MC3300x",
              fabricante: "Zebra Technologies",
              numero_serie: "SN-OFF",
              app_version: "0.1.0",
              android_version: "11",
              usuario_id: "u-2",
              usuario_nombre: "Supervisor",
              ultimo_visto_en: "2024-06-01T11:00:00Z",
              registrado_en: "2024-06-01T10:00:00Z",
              sesion_activa: false,
              en_linea: false,
              estado: "sesion_cerrada",
            },
          ],
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    render(<DashboardPage />);
    expect(await screen.findByText("Inactivo")).toBeInTheDocument();
    expect(screen.getByText("Sesión cerrada")).toBeInTheDocument();
    expect(screen.getByText(/1 inactivo/i)).toBeInTheDocument();
  });

  it("reconsulta el resumen periódicamente mientras Operaciones está abierta", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<DashboardPage />);
      expect(await screen.findByText("Dispositivos MC33")).toBeInTheDocument();

      const resumenCalls = () =>
        apiFetchMock.mock.calls.filter(([path]) =>
          String(path).startsWith("/dashboard/resumen"),
        ).length;

      expect(resumenCalls()).toBe(1);
      await vi.advanceTimersByTimeAsync(35_000);
      expect(resumenCalls()).toBeGreaterThanOrEqual(2);
      await vi.advanceTimersByTimeAsync(35_000);
      expect(resumenCalls()).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
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
            activos_sin_ubicacion: 0,
            cobertura_ubicacion_pct: 0,
            inventarios_pendientes_auditoria: 0,
            inventarios_con_discrepancia_pendiente: 0,
            inventarios_activos_pendientes: 0,
            inventarios_avance_pct: 0,
            transferencias_en_transito: 0,
            transferencias_activos_pendientes: 0,
            transferencias_avance_pct: 0,
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
