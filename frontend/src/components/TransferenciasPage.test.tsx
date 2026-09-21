import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransferenciasPage from "./TransferenciasPage";

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
  }),
}));

import { apiFetch } from "../lib/api";

const apiFetchMock = vi.mocked(apiFetch);

const depositos = [
  {
    id: "dep-1",
    nombre: "Central",
    descripcion: null,
    direccion: null,
    activo: true,
    creado_en: "2024-01-01T00:00:00Z",
    actualizado_en: "2024-01-01T00:00:00Z",
  },
  {
    id: "dep-2",
    nombre: "Sur",
    descripcion: null,
    direccion: null,
    activo: true,
    creado_en: "2024-01-01T00:00:00Z",
    actualizado_en: "2024-01-01T00:00:00Z",
  },
];

const categoria = {
  id: "cat-1",
  nombre: "IT",
  descripcion: null,
  activa: true,
  creado_en: "2024-01-01T00:00:00Z",
  actualizado_en: "2024-01-01T00:00:00Z",
};

const activos = [
  {
    id: "act-1",
    numero_patrimonial: "PAT-1",
    descripcion: "Notebook",
    categoria_id: "cat-1",
    epc: null,
    datos_tecnicos: null,
    activo: true,
    creado_en: "2024-01-01T00:00:00Z",
    actualizado_en: "2024-01-01T00:00:00Z",
    categoria,
    stock_etiquetas: 2,
    ubicacion: {
      ubicacion_id: "ubi-1",
      ubicacion_codigo: "A-01",
      sector_id: "sec-1",
      sector_nombre: "Sector A",
      deposito_id: "dep-1",
      deposito_nombre: "Central",
    },
  },
  {
    id: "act-2",
    numero_patrimonial: "PAT-2",
    descripcion: "Monitor",
    categoria_id: "cat-1",
    epc: null,
    datos_tecnicos: null,
    activo: true,
    creado_en: "2024-01-01T00:00:00Z",
    actualizado_en: "2024-01-01T00:00:00Z",
    categoria,
    stock_etiquetas: 1,
    ubicacion: {
      ubicacion_id: "ubi-1",
      ubicacion_codigo: "A-01",
      sector_id: "sec-1",
      sector_nombre: "Sector A",
      deposito_id: "dep-1",
      deposito_nombre: "Central",
    },
  },
];

function stockUnit(
  activo: (typeof activos)[number],
  epc: string,
  deps: { ubicacion_id: string; ubicacion_codigo: string; sector_id: string; sector_nombre: string },
) {
  return {
    activo_id: activo.id,
    numero_patrimonial: activo.numero_patrimonial,
    descripcion: activo.descripcion,
    categoria_id: activo.categoria_id,
    categoria_nombre: "IT",
    epc,
    ...deps,
  };
}

const stockDep1 = {
  deposito_id: "dep-1",
  deposito_nombre: "Central",
  total: 3,
  activos: [
    stockUnit(activos[0], "E280AAA1", {
      ubicacion_id: "ubi-1",
      ubicacion_codigo: "A-01",
      sector_id: "sec-1",
      sector_nombre: "Sector A",
    }),
    stockUnit(activos[0], "E280AAA2", {
      ubicacion_id: "ubi-1",
      ubicacion_codigo: "A-01",
      sector_id: "sec-1",
      sector_nombre: "Sector A",
    }),
    stockUnit(activos[1], "E280BBB1", {
      ubicacion_id: "ubi-1",
      ubicacion_codigo: "A-01",
      sector_id: "sec-1",
      sector_nombre: "Sector A",
    }),
  ],
};

const stockDep2Empty = {
  deposito_id: "dep-2",
  deposito_nombre: "Sur",
  total: 0,
  activos: [] as ReturnType<typeof stockUnit>[],
};

/** PAT-1 también en Sur (1 u.) — mismo SKU en dos depósitos. */
const stockDep2WithPat1 = {
  deposito_id: "dep-2",
  deposito_nombre: "Sur",
  total: 1,
  activos: [
    stockUnit(activos[0], "E280CCC1", {
      ubicacion_id: "ubi-2",
      ubicacion_codigo: "B-01",
      sector_id: "sec-2",
      sector_nombre: "Sector B",
    }),
  ],
};

const depDetalle1 = {
  ...depositos[0],
  sectores: [
    {
      id: "sec-1",
      deposito_id: "dep-1",
      nombre: "Sector A",
      descripcion: null,
      activo: true,
      creado_en: "2024-01-01T00:00:00Z",
      actualizado_en: "2024-01-01T00:00:00Z",
      ubicaciones: [
        {
          id: "ubi-1",
          sector_id: "sec-1",
          codigo: "A-01",
          descripcion: null,
          activo: true,
          creado_en: "2024-01-01T00:00:00Z",
          actualizado_en: "2024-01-01T00:00:00Z",
        },
        {
          id: "ubi-1b",
          sector_id: "sec-1",
          codigo: "A-02",
          descripcion: null,
          activo: true,
          creado_en: "2024-01-01T00:00:00Z",
          actualizado_en: "2024-01-01T00:00:00Z",
        },
      ],
    },
  ],
};

const depDetalle2 = {
  ...depositos[1],
  sectores: [
    {
      id: "sec-2",
      deposito_id: "dep-2",
      nombre: "Sector B",
      descripcion: null,
      activo: true,
      creado_en: "2024-01-01T00:00:00Z",
      actualizado_en: "2024-01-01T00:00:00Z",
      ubicaciones: [
        {
          id: "ubi-2",
          sector_id: "sec-2",
          codigo: "B-01",
          descripcion: null,
          activo: true,
          creado_en: "2024-01-01T00:00:00Z",
          actualizado_en: "2024-01-01T00:00:00Z",
        },
      ],
    },
  ],
};

const transferencia = {
  id: "xfer-1",
  tipo: "deposito",
  deposito_origen_id: "dep-1",
  deposito_destino_id: "dep-2",
  persona_destino_id: null,
  persona_destino_nombre: null,
  estado: "completada",
  notas: null,
  creado_en: "2024-01-02T00:00:00Z",
  actualizado_en: "2024-01-02T00:00:00Z",
  enviado_en: "2024-01-02T00:00:00Z",
  completado_en: "2024-01-02T00:00:00Z",
  usuario_nombre: "Admin",
  total_activos: 1,
  confirmados_origen: 1,
  confirmados_destino: 1,
  detalles: [
    {
      id: "det-1",
      activo_id: "act-1",
      numero_patrimonial: "PAT-1",
      descripcion: "Notebook",
      epc: "E280AAA",
      confirmado_origen: true,
      confirmado_destino: true,
    },
  ],
};

function mockApi(opts?: { multiDepositPat1?: boolean; multiUbicacionPat1?: boolean }) {
  const stock2 = opts?.multiDepositPat1 ? stockDep2WithPat1 : stockDep2Empty;
  const stock1 = opts?.multiUbicacionPat1
    ? {
        ...stockDep1,
        total: 3,
        activos: [
          stockUnit(activos[0], "E280AAA1", {
            ubicacion_id: "ubi-1",
            ubicacion_codigo: "A-01",
            sector_id: "sec-1",
            sector_nombre: "Sector A",
          }),
          stockUnit(activos[0], "E280AAA2", {
            ubicacion_id: "ubi-1b",
            ubicacion_codigo: "A-02",
            sector_id: "sec-1",
            sector_nombre: "Sector A",
          }),
          stockUnit(activos[1], "E280BBB1", {
            ubicacion_id: "ubi-1",
            ubicacion_codigo: "A-01",
            sector_id: "sec-1",
            sector_nombre: "Sector A",
          }),
        ],
      }
    : stockDep1;
  apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (path === "/depositos") return depositos;
    if (path === "/activos") return activos;
    if (path === "/depositos/dep-1/stock") return stock1;
    if (path === "/depositos/dep-2/stock") return stock2;
    if (path === "/depositos/dep-1" || path.startsWith("/depositos/dep-1?")) {
      return depDetalle1;
    }
    if (path === "/depositos/dep-2" || path.startsWith("/depositos/dep-2?")) {
      return depDetalle2;
    }
    if (path.startsWith("/personas")) return [];
    if (path.startsWith("/transferencias?") || path === "/transferencias") {
      if (method === "GET") return [];
      if (method === "POST") return transferencia;
    }
    if (path === "/transferencias/xfer-1") {
      return transferencia;
    }
    throw new Error(`Unexpected path: ${path}`);
  });
}

async function openCreateWizard(user: ReturnType<typeof userEvent.setup>) {
  expect(
    await screen.findByRole("heading", { name: /^historial de movimientos$/i }),
  ).toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: /\+ nuevo movimiento/i })[0]);
  expect(await screen.findByLabelText(/pasos del movimiento/i)).toHaveTextContent(/artículos/i);
  expect(await screen.findByRole("combobox", { name: /buscar artículos/i })).toBeInTheDocument();
  await waitFor(() => {
    expect(apiFetchMock).toHaveBeenCalledWith("/depositos/dep-1/stock");
    expect(apiFetchMock).toHaveBeenCalledWith("/depositos/dep-2/stock");
  });
}

async function selectArticuloFromSearch(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  optionName: RegExp,
) {
  const search = screen.getByRole("combobox", { name: /buscar artículos/i });
  await user.clear(search);
  await user.type(search, query);
  const listbox = await screen.findByRole("listbox", { name: /resultados de búsqueda/i });
  await user.click(within(listbox).getByRole("option", { name: optionName }));
}

async function completeDestinoCascade(
  user: ReturnType<typeof userEvent.setup>,
  opts?: { depositoId?: string; sectorId?: string; ubicacionId?: string },
) {
  const depositoId = opts?.depositoId ?? "dep-2";
  const sectorId = opts?.sectorId ?? "sec-2";
  const ubicacionId = opts?.ubicacionId ?? "ubi-2";

  const destSelect = await screen.findByLabelText(/depósito destino/i);
  await waitFor(() => {
    expect(destSelect).toBeEnabled();
  });
  if ((destSelect as HTMLSelectElement).value !== depositoId) {
    await user.selectOptions(destSelect, depositoId);
  }

  const sectorSelect = await screen.findByLabelText(/sector destino/i);
  await waitFor(() => {
    expect(sectorSelect).toBeEnabled();
  });
  await user.selectOptions(sectorSelect, sectorId);

  const ubiSelect = screen.getByLabelText(/ubicación destino/i);
  await waitFor(() => {
    expect(ubiSelect).toBeEnabled();
  });
  await user.selectOptions(ubiSelect, ubicacionId);
}

describe("TransferenciasPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    sessionStorage.setItem("don_nicolas_token", "test-token");
    mockApi();
  });

  it("crea un movimiento con buscador, selección y resumen", async () => {
    const user = userEvent.setup();
    render(<TransferenciasPage />);

    await openCreateWizard(user);

    expect(screen.queryByLabelText(/^depósito origen$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^siguiente$/i })).toBeDisabled();
    expect(screen.getByText(/ningún artículo seleccionado/i)).toBeInTheDocument();

    await selectArticuloFromSearch(user, "PAT-1", /PAT-1.*Notebook/i);

    expect(await screen.findByRole("table")).toBeInTheDocument();
    const selectedTable = screen.getByRole("table");
    expect(within(selectedTable).getByText(/PAT-1/)).toBeInTheDocument();
    expect(within(selectedTable).queryByText(/PAT-2/)).not.toBeInTheDocument();
    // Un solo depósito + una ubicación → origen auto (Central · Sector A · A-01)
    expect(within(selectedTable).getByText(/Central · Sector A · A-01/i)).toBeInTheDocument();
    expect(within(selectedTable).getByText("2")).toBeInTheDocument();
    expect(screen.getByLabelText(/cantidad a mover de pat-1/i)).toHaveValue(1);
    expect(screen.getByRole("button", { name: /quitar pat-1/i })).toBeInTheDocument();
    expect(
      await screen.findByText((_, node) =>
        Boolean(
          node?.classList?.contains("xfer-create-sel-chip") &&
            /1 sku · 1 u\./i.test(node.textContent ?? "") &&
            /central/i.test(node.textContent ?? ""),
        ),
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^siguiente$/i }));

    expect(await screen.findByLabelText(/depósito destino/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/pasos del movimiento/i)).toHaveTextContent(/datos/i);
    expect(screen.getByRole("button", { name: /^siguiente$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^registrar movimiento$/i })).not.toBeInTheDocument();
    expect(
      apiFetchMock.mock.calls.some(
        ([path, init]) =>
          path === "/transferencias" && (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);

    await waitFor(() => {
      expect(screen.getByLabelText(/depósito destino/i)).toHaveValue("dep-2");
    });
    // Cascada: sector y ubicación vacíos hasta elegir
    expect(screen.getByLabelText(/sector destino/i)).toHaveValue("");
    expect(screen.getByLabelText(/ubicación destino/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /^siguiente$/i })).toBeDisabled();

    await completeDestinoCascade(user);
    expect(screen.getByLabelText(/ubicación destino/i)).toHaveValue("ubi-2");
    expect(screen.getByRole("button", { name: /^siguiente$/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /^siguiente$/i }));

    const resumen = await screen.findByLabelText(/resumen del movimiento/i);
    expect(resumen).toBeInTheDocument();
    expect(screen.getByLabelText(/pasos del movimiento/i)).toHaveTextContent(/resumen/i);
    expect(within(resumen).getByText(/a depósito \/ ubicación/i)).toBeInTheDocument();
    expect(within(resumen).getByText(/Sur · Sector B · B-01/i)).toBeInTheDocument();
    expect(within(resumen).getByText(/PAT-1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^registrar movimiento$/i })).toBeEnabled();
    expect(
      apiFetchMock.mock.calls.some(
        ([path, init]) =>
          path === "/transferencias" && (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: /^registrar movimiento$/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/transferencias",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"deposito_origen_id":"dep-1"'),
        }),
      );
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/transferencias",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(
            '"lineas":[{"activo_id":"act-1","cantidad":1,"ubicacion_origen_id":"ubi-1"}]',
          ),
        }),
      );
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/transferencias",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"ubicacion_destino_id":"ubi-2"'),
        }),
      );
    });

    // No abre el modal de detalle al crear
    expect(screen.queryByRole("heading", { name: /movimiento a depósito/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/progreso del movimiento/i)).not.toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /^historial de movimientos$/i }),
    ).toBeInTheDocument();
  });

  it("no crea el movimiento con Enter en el paso Artículos", async () => {
    const user = userEvent.setup();
    render(<TransferenciasPage />);

    await openCreateWizard(user);
    await selectArticuloFromSearch(user, "PAT-1", /PAT-1.*Notebook/i);

    const search = screen.getByRole("combobox", { name: /buscar artículos/i });
    await user.click(search);
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("heading", { name: /movimiento a depósito/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^registrar movimiento$/i })).not.toBeInTheDocument();
    expect(
      apiFetchMock.mock.calls.some(
        ([path, init]) =>
          path === "/transferencias" && (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);
  });

  it("SKU con un solo depósito: origen auto-completado en la tabla", async () => {
    const user = userEvent.setup();
    render(<TransferenciasPage />);

    await openCreateWizard(user);
    await selectArticuloFromSearch(user, "PAT-2", /PAT-2.*Monitor/i);

    const selectedTable = await screen.findByRole("table");
    expect(within(selectedTable).getByText(/Central · Sector A · A-01/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/origen de pat-2/i)).not.toBeInTheDocument();
    expect(within(selectedTable).getByText("1", { selector: "td.num" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^siguiente$/i })).toBeEnabled();
  });

  it("mismo SKU en dos depósitos: una opción y origen en la tabla antes de Siguiente", async () => {
    mockApi({ multiDepositPat1: true });
    const user = userEvent.setup();
    render(<TransferenciasPage />);

    await openCreateWizard(user);

    const search = screen.getByRole("combobox", { name: /buscar artículos/i });
    await user.type(search, "PAT-1");

    const listbox = await screen.findByRole("listbox", { name: /resultados de búsqueda/i });
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent(/PAT-1/i);
    expect(options[0]).toHaveTextContent(/2 depósitos/i);
    expect(options[0]).toHaveTextContent(/3 disp/i);

    await user.click(options[0]);

    const selectedTable = await screen.findByRole("table");
    expect(within(selectedTable).getByText(/PAT-1/)).toBeInTheDocument();
    const origenSelect = screen.getByLabelText(/origen de pat-1/i);
    expect(origenSelect).toHaveValue("");
    expect(within(selectedTable).getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^siguiente$/i })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: /elegir depósito de origen/i })).not.toBeInTheDocument();

    await user.selectOptions(origenSelect, "dep-2:ubi-2");

    expect(await within(selectedTable).findByText(/Sur · Sector B · B-01/i)).toBeInTheDocument();
    expect(within(selectedTable).getByText("1", { selector: "td.num" })).toBeInTheDocument();
    expect(within(selectedTable).getByText("1", { selector: ".xfer-qty-fixed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^siguiente$/i })).toBeEnabled();
    expect(
      await screen.findByText((_, node) =>
        Boolean(
          node?.classList?.contains("xfer-create-sel-chip") &&
            /sur/i.test(node.textContent ?? ""),
        ),
      ),
    ).toBeInTheDocument();
  });

  it("mismo depósito, dos ubicaciones: hay que elegir de cuál salir", async () => {
    mockApi({ multiUbicacionPat1: true });
    const user = userEvent.setup();
    render(<TransferenciasPage />);

    await openCreateWizard(user);
    await selectArticuloFromSearch(user, "PAT-1", /PAT-1.*Notebook/i);

    const selectedTable = await screen.findByRole("table");
    const origenSelect = screen.getByLabelText(/origen de pat-1/i);
    expect(origenSelect).toBeInTheDocument();
    expect(origenSelect).toHaveValue("");
    expect(screen.getByRole("button", { name: /^siguiente$/i })).toBeDisabled();

    await user.selectOptions(origenSelect, "dep-1:ubi-1b");
    expect(await within(selectedTable).findByText(/Central · Sector A · A-02/i)).toBeInTheDocument();
    expect(within(selectedTable).getByText("1", { selector: "td.num" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^siguiente$/i })).toBeEnabled();
  });

  it("datos: cascada depósito → sector → ubicación", async () => {
    const user = userEvent.setup();
    render(<TransferenciasPage />);

    await openCreateWizard(user);
    await selectArticuloFromSearch(user, "PAT-1", /PAT-1.*Notebook/i);
    await user.click(screen.getByRole("button", { name: /^siguiente$/i }));

    const dest = await screen.findByLabelText(/depósito destino/i);
    await waitFor(() => expect(dest).toHaveValue("dep-2"));

    const sector = screen.getByLabelText(/sector destino/i);
    const ubi = screen.getByLabelText(/ubicación destino/i);
    expect(sector).toHaveValue("");
    expect(ubi).toBeDisabled();

    await user.selectOptions(sector, "sec-2");
    expect(ubi).toBeEnabled();
    expect(ubi).toHaveValue("");

    await user.selectOptions(ubi, "ubi-2");
    expect(ubi).toHaveValue("ubi-2");

    // Cambiar depósito limpia sector/ubicación
    await user.selectOptions(dest, "dep-1");
    await waitFor(() => {
      expect(screen.getByLabelText(/sector destino/i)).toHaveValue("");
    });
    expect(screen.getByLabelText(/ubicación destino/i)).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/sector destino/i), "sec-1");
    await user.selectOptions(screen.getByLabelText(/ubicación destino/i), "ubi-1b");
    expect(screen.getByLabelText(/ubicación destino/i)).toHaveValue("ubi-1b");
  });
});
