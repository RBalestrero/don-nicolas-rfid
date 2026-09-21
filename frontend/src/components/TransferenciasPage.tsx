import { Fragment, KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import type {
  Activo,
  Deposito,
  DepositoDetalle,
  Persona,
  StockActivoDetalle,
  StockDeposito,
  Transferencia,
  TransferenciaCreatePayload,
  TransferenciaListItem,
} from "../types";
import ExportButtons from "./ExportButtons";
import EmptyState from "./EmptyState";
import Modal from "./Modal";
import PageHeader from "./PageHeader";
import { useToast } from "../context/ToastContext";
import { usePermissions } from "../lib/usePermissions";
import {
  filterTransferencias,
  hasActiveTransferenciasFilters,
} from "../lib/filterTransferencias";
import { groupTransferDetalles } from "../lib/groupStockBySku";

type XferDetalleTab = "detalle" | "articulos";
type XferCreateStep = "articulos" | "datos" | "resumen";

type StockEnDeposito = {
  depositoId: string;
  depositoNombre: string;
  disponible: number;
};

/** Slot de stock: depósito + ubicación concreta (sector/código). */
type StockSlot = {
  key: string;
  depositoId: string;
  depositoNombre: string;
  ubicacionId: string;
  sectorNombre: string;
  ubicacionCodigo: string;
  disponible: number;
  label: string;
};

type ComboStockOption = {
  key: string;
  activo: Activo;
  deposits: StockEnDeposito[];
  totalDisponible: number;
};

const XFER_DETALLE_TABS: { id: XferDetalleTab; label: string }[] = [
  { id: "detalle", label: "Detalle" },
  { id: "articulos", label: "Artículos" },
];

const XFER_CREATE_STEPS: { id: XferCreateStep; label: string; short: string }[] = [
  { id: "articulos", label: "Artículos", short: "Artículos" },
  { id: "datos", label: "Datos", short: "Datos" },
  { id: "resumen", label: "Resumen", short: "Resumen" },
];

const COMBO_MAX_RESULTS = 12;
const CREATE_STEP_ORDER: XferCreateStep[] = ["articulos", "datos", "resumen"];

/** Cuenta unidades por activo_id a partir del stock de un depósito. */
function buildStockByActivo(
  stocks: StockDeposito[],
): Map<string, StockEnDeposito[]> {
  const map = new Map<string, StockEnDeposito[]>();
  for (const stock of stocks) {
    const counts = new Map<string, number>();
    for (const unit of stock.activos) {
      counts.set(unit.activo_id, (counts.get(unit.activo_id) ?? 0) + 1);
    }
    for (const [activoId, disponible] of counts) {
      if (disponible <= 0) continue;
      const list = map.get(activoId) ?? [];
      list.push({
        depositoId: stock.deposito_id,
        depositoNombre: stock.deposito_nombre,
        disponible,
      });
      map.set(activoId, list);
    }
  }
  return map;
}

/** Agrupa unidades de un SKU en slots depósito + ubicación. */
function buildSlotsForActivo(
  unitsByDeposito: Map<string, StockActivoDetalle[]>,
  depositoNombres: Map<string, string>,
  activoId: string,
  depositoFilter?: string,
): StockSlot[] {
  const slots: StockSlot[] = [];
  for (const [depositoId, units] of unitsByDeposito) {
    if (depositoFilter && depositoId !== depositoFilter) continue;
    const ofActivo = units.filter((u) => u.activo_id === activoId && u.ubicacion_id);
    if (ofActivo.length === 0) continue;
    const byUbi = new Map<string, StockActivoDetalle[]>();
    for (const u of ofActivo) {
      const list = byUbi.get(u.ubicacion_id) ?? [];
      list.push(u);
      byUbi.set(u.ubicacion_id, list);
    }
    const depNombre = depositoNombres.get(depositoId) ?? "";
    for (const [ubicacionId, group] of byUbi) {
      const sample = group[0];
      const label = depNombre
        ? `${depNombre} · ${sample.sector_nombre} · ${sample.ubicacion_codigo}`
        : `${sample.sector_nombre} · ${sample.ubicacion_codigo}`;
      slots.push({
        key: `${depositoId}:${ubicacionId}`,
        depositoId,
        depositoNombre: depNombre,
        ubicacionId,
        sectorNombre: sample.sector_nombre,
        ubicacionCodigo: sample.ubicacion_codigo,
        disponible: group.length,
        label,
      });
    }
  }
  slots.sort((a, b) => a.label.localeCompare(b.label, "es"));
  return slots;
}

function estadoLabel(estado: string): string {
  switch (estado) {
    case "pendiente":
      return "Pendiente";
    case "en_transito":
      return "En tránsito";
    case "completada":
      return "Completada";
    case "cancelada":
      return "Cancelada";
    default:
      return estado;
  }
}

function estadoBadgeClass(estado: string): string {
  if (estado === "completada") return "ok";
  if (estado === "cancelada") return "danger";
  return "warn";
}

export default function TransferenciasPage() {
  const toast = useToast();
  const perms = usePermissions();
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [lista, setLista] = useState<TransferenciaListItem[]>([]);
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [tipoMovimiento, setTipoMovimiento] = useState<"deposito" | "persona">("deposito");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaDestinoId, setPersonaDestinoId] = useState("");
  const [nuevaPersonaNombre, setNuevaPersonaNombre] = useState("");
  const [catalogo, setCatalogo] = useState<Activo[]>([]);
  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [stockByActivo, setStockByActivo] = useState<Map<string, StockEnDeposito[]>>(
    () => new Map(),
  );
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  /** Origen por fila (activo_id → deposito_id). Vacío hasta elegir. */
  const [rowOrigen, setRowOrigen] = useState<Record<string, string>>({});
  const [destinoDetalle, setDestinoDetalle] = useState<DepositoDetalle | null>(null);
  const [sectorDestinoId, setSectorDestinoId] = useState("");
  const [ubicacionDestinoId, setUbicacionDestinoId] = useState("");
  const [notas, setNotas] = useState("");
  const [stockUnitsByDeposito, setStockUnitsByDeposito] = useState<
    Map<string, StockActivoDetalle[]>
  >(new Map());
  const [depositoNombresStock, setDepositoNombresStock] = useState<Map<string, string>>(
    () => new Map(),
  );
  /** Origen por fila: activo_id → ubicacion_id (dentro del depósito de origen). */
  const [rowOrigenUbicacion, setRowOrigenUbicacion] = useState<Record<string, string>>({});
  const [activa, setActiva] = useState<Transferencia | null>(null);
  const [xferTab, setXferTab] = useState<XferDetalleTab>("detalle");
  const [createStep, setCreateStep] = useState<XferCreateStep>("articulos");
  const xferTabsId = useId();
  const createStepsId = useId();
  const createComboListId = useId();
  const xferTabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const comboWrapRef = useRef<HTMLDivElement | null>(null);
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [comboHighlight, setComboHighlight] = useState(0);

  useEffect(() => {
    const flag = sessionStorage.getItem("dn_xfer_filter");
    if (flag === "abiertas") {
      setEstadoFilter("abiertas");
      sessionStorage.removeItem("dn_xfer_filter");
    }
  }, []);

  useEffect(() => {
    if (activa) setXferTab("detalle");
  }, [activa?.id]);

  const selectXferTab = (next: XferDetalleTab) => {
    setXferTab(next);
  };

  const goCreateStep = (next: XferCreateStep) => {
    setError(null);
    setCreateStep(next);
  };

  const onXferTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % XFER_DETALLE_TABS.length;
    if (e.key === "ArrowLeft") next = (index - 1 + XFER_DETALLE_TABS.length) % XFER_DETALLE_TABS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = XFER_DETALLE_TABS.length - 1;
    selectXferTab(XFER_DETALLE_TABS[next].id);
    xferTabRefs.current[next]?.focus();
  };

  const nombreDeposito = useCallback(
    (id: string) => depositos.find((d) => d.id === id)?.nombre ?? id.slice(0, 8),
    [depositos],
  );

  const etiquetaDestino = useCallback(
    (t: TransferenciaListItem | Transferencia) => {
      if (t.tipo === "persona") {
        return t.persona_destino_nombre ?? "Persona";
      }
      if (t.deposito_destino_id) return nombreDeposito(t.deposito_destino_id);
      return "—";
    },
    [nombreDeposito],
  );

  const filterOpts = useMemo(
    () => ({ search, estado: estadoFilter }),
    [search, estadoFilter],
  );
  const filtersActive = hasActiveTransferenciasFilters(filterOpts);
  const listaFiltrada = useMemo(
    () => filterTransferencias(lista, filterOpts, nombreDeposito),
    [lista, filterOpts, nombreDeposito],
  );

  const disponibleEnDeposito = useCallback(
    (
      activoId: string,
      depositoId: string,
      opts?: { excluirUbicacionId?: string; soloUbicacionId?: string },
    ): number => {
      const excluir = opts?.excluirUbicacionId;
      const solo = opts?.soloUbicacionId;
      if (excluir || solo) {
        const units = stockUnitsByDeposito.get(depositoId) ?? [];
        return units.filter((u) => {
          if (u.activo_id !== activoId) return false;
          if (solo && u.ubicacion_id !== solo) return false;
          if (excluir && u.ubicacion_id === excluir) return false;
          return true;
        }).length;
      }
      const list = stockByActivo.get(activoId);
      if (!list) return 0;
      return list.find((s) => s.depositoId === depositoId)?.disponible ?? 0;
    },
    [stockByActivo, stockUnitsByDeposito],
  );

  const slotsForActivo = useCallback(
    (activoId: string, depositoFilter?: string) =>
      buildSlotsForActivo(
        stockUnitsByDeposito,
        depositoNombresStock,
        activoId,
        depositoFilter,
      ),
    [stockUnitsByDeposito, depositoNombresStock],
  );

  const stockOptions = useMemo(() => {
    const options: ComboStockOption[] = [];
    for (const activo of catalogo) {
      if (!activo.activo) continue;
      const deposits = (stockByActivo.get(activo.id) ?? []).filter((d) => d.disponible > 0);
      if (deposits.length === 0) continue;
      if (origenId && !deposits.some((d) => d.depositoId === origenId)) continue;
      options.push({
        key: activo.id,
        activo,
        deposits,
        totalDisponible: deposits.reduce((sum, d) => sum + d.disponible, 0),
      });
    }
    return options;
  }, [catalogo, stockByActivo, origenId]);

  const catalogoDisponible = useMemo(() => {
    if (stockOptions.length > 0) return true;
    // Catálogo vacío solo si no hay selección (p. ej. origen sin más stock)
    return Object.values(selectedQty).some((n) => n > 0);
  }, [stockOptions, selectedQty]);

  const comboMatches = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    if (!q) return [];
    return stockOptions
      .filter((opt) => {
        const haystack = [
          opt.activo.numero_patrimonial,
          opt.activo.descripcion,
          opt.activo.categoria?.nombre,
          ...opt.deposits.map((d) => d.depositoNombre),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, COMBO_MAX_RESULTS);
  }, [stockOptions, stockSearch]);

  const articulosSeleccionados = useMemo(() => {
    return Object.entries(selectedQty)
      .filter(([, n]) => n > 0)
      .map(([id, cantidad]) => {
        const activo = catalogo.find((a) => a.id === id);
        if (!activo) return null;
        const deposits = (stockByActivo.get(id) ?? []).filter((d) => d.disponible > 0);
        const origenRow = rowOrigen[id] ?? "";
        return { activo, cantidad, deposits, origenRow };
      })
      .filter(
        (
          row,
        ): row is {
          activo: Activo;
          cantidad: number;
          deposits: StockEnDeposito[];
          origenRow: string;
        } => row !== null,
      );
  }, [selectedQty, catalogo, stockByActivo, rowOrigen]);

  const unidadesSeleccionadas = useMemo(
    () => Object.values(selectedQty).reduce((acc, n) => acc + n, 0),
    [selectedQty],
  );
  const skusSeleccionados = useMemo(
    () => Object.values(selectedQty).filter((n) => n > 0).length,
    [selectedQty],
  );

  const origenDerivadoId = origenId;

  const origenDerivadoNombre = useMemo(() => {
    if (!origenId) return "";
    for (const list of stockByActivo.values()) {
      const hit = list.find((s) => s.depositoId === origenId);
      if (hit) return hit.depositoNombre;
    }
    return nombreDeposito(origenId);
  }, [origenId, stockByActivo, nombreDeposito]);

  const articulosConOrigenOk = useMemo(() => {
    if (articulosSeleccionados.length === 0 || !origenId) return false;
    return articulosSeleccionados.every((row) => {
      if (row.origenRow !== origenId) return false;
      const slots = slotsForActivo(row.activo.id, origenId);
      if (slots.length === 0) return true;
      const ubi = rowOrigenUbicacion[row.activo.id];
      return Boolean(ubi) && slots.some((s) => s.ubicacionId === ubi);
    });
  }, [articulosSeleccionados, origenId, rowOrigenUbicacion, slotsForActivo]);

  useEffect(() => {
    if (skusSeleccionados === 0) {
      if (origenId) setOrigenId("");
      setRowOrigen((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setRowOrigenUbicacion((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    }
  }, [skusSeleccionados, origenId]);

  useEffect(() => {
    setComboHighlight(0);
  }, [stockSearch]);

  useEffect(() => {
    if (!comboOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const el = comboWrapRef.current;
      if (el && !el.contains(e.target as Node)) {
        setComboOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [comboOpen]);

  const clearFilters = () => {
    setSearch("");
    setEstadoFilter("");
  };

  const sectoresDestino = useMemo(() => {
    if (!destinoDetalle) return [];
    return destinoDetalle.sectores.filter((s) => s.activo);
  }, [destinoDetalle]);

  const ubicacionesDestino = useMemo(() => {
    if (!destinoDetalle || !sectorDestinoId) return [];
    const sector = destinoDetalle.sectores.find((s) => s.id === sectorDestinoId);
    if (!sector) return [];
    return sector.ubicaciones
      .filter((u) => u.activo)
      .map((u) => ({
        id: u.id,
        codigo: u.codigo,
        label: u.codigo,
      }));
  }, [destinoDetalle, sectorDestinoId]);

  const sectorDestinoNombre = useMemo(() => {
    return sectoresDestino.find((s) => s.id === sectorDestinoId)?.nombre ?? "";
  }, [sectoresDestino, sectorDestinoId]);

  const ubicacionDestinoCodigo = useMemo(() => {
    return ubicacionesDestino.find((u) => u.id === ubicacionDestinoId)?.codigo ?? "";
  }, [ubicacionesDestino, ubicacionDestinoId]);

  const destinoResumenLabel = useMemo(() => {
    if (!destinoId) return "";
    const parts = [nombreDeposito(destinoId)];
    if (sectorDestinoNombre) parts.push(sectorDestinoNombre);
    if (ubicacionDestinoCodigo) parts.push(ubicacionDestinoCodigo);
    return parts.join(" · ");
  }, [destinoId, nombreDeposito, sectorDestinoNombre, ubicacionDestinoCodigo]);

  const personaDestinoNombre = useMemo(() => {
    return personas.find((p) => p.id === personaDestinoId)?.nombre ?? "";
  }, [personas, personaDestinoId]);

  const canAvanzarAResumen =
    !busy &&
    (tipoMovimiento === "persona"
      ? Boolean(personaDestinoId)
      : Boolean(destinoId) && Boolean(sectorDestinoId) && Boolean(ubicacionDestinoId));

  const canFinalizar =
    !busy &&
    unidadesSeleccionadas > 0 &&
    Boolean(origenDerivadoId) &&
    articulosConOrigenOk &&
    (tipoMovimiento === "persona"
      ? Boolean(personaDestinoId)
      : Boolean(destinoId) && Boolean(ubicacionDestinoId));

  const depositosDestinoOpciones = depositos;

  const loadBase = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const deps = await apiFetch<Deposito[]>("/depositos", { signal });
      if (signal?.aborted) return;
      const activos = deps.filter((d) => d.activo);
      setDepositos(activos);
      setDestinoId((current) => {
        if (current) return current;
        return activos[1]?.id || activos[0]?.id || "";
      });
      const items = await apiFetch<TransferenciaListItem[]>("/transferencias?limit=30", {
        signal,
      });
      if (signal?.aborted) return;
      setLista(items);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : "Error al cargar movimientos");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const loadPersonas = useCallback(async (signal?: AbortSignal) => {
    try {
      const items = await apiFetch<Persona[]>("/personas?limit=200", { signal });
      if (signal?.aborted) return;
      setPersonas(items);
      setPersonaDestinoId((current) => current || items[0]?.id || "");
    } catch {
      if (!signal?.aborted) setPersonas([]);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void loadBase(ac.signal);
    void loadPersonas(ac.signal);
    return () => ac.abort();
  }, [loadBase, loadPersonas]);

  useEffect(() => {
    if (activa) setShowCreate(false);
  }, [activa?.id]);

  useEffect(() => {
    if (!showCreate) return;
    let cancelled = false;
    setCatalogoLoading(true);
    setCatalogo([]);
    setStockByActivo(new Map());
    setStockUnitsByDeposito(new Map());
    (async () => {
      try {
        const depsActivos = depositos.filter((d) => d.activo);
        const [items, ...stocks] = await Promise.all([
          apiFetch<Activo[]>("/activos"),
          ...depsActivos.map(async (d) => {
            try {
              return await apiFetch<StockDeposito>(`/depositos/${d.id}/stock`);
            } catch {
              return null;
            }
          }),
        ]);
        if (cancelled) return;
        const stocksOk = stocks.filter((s): s is StockDeposito => s !== null);
        setCatalogo(items);
        setStockByActivo(buildStockByActivo(stocksOk));
        setStockUnitsByDeposito(
          new Map(stocksOk.map((s) => [s.deposito_id, s.activos])),
        );
        setDepositoNombresStock(
          new Map(stocksOk.map((s) => [s.deposito_id, s.deposito_nombre])),
        );
      } catch (err) {
        if (!cancelled) {
          setCatalogo([]);
          setStockByActivo(new Map());
          setStockUnitsByDeposito(new Map());
          setDepositoNombresStock(new Map());
          const msg = err instanceof Error ? err.message : "Error al cargar artículos";
          setError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setCatalogoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast identity cambia con cada toast
  }, [showCreate, depositos]);

  useEffect(() => {
    if (tipoMovimiento !== "deposito" || !destinoId) {
      if (tipoMovimiento !== "deposito") {
        setDestinoDetalle(null);
        setSectorDestinoId("");
        setUbicacionDestinoId("");
      }
      return;
    }
    let cancelled = false;
    setSectorDestinoId("");
    setUbicacionDestinoId("");
    setDestinoDetalle(null);
    (async () => {
      try {
        const data = await apiFetch<DepositoDetalle>(`/depositos/${destinoId}`);
        if (!cancelled) {
          setDestinoDetalle(data);
        }
      } catch (err) {
        if (!cancelled) {
          setDestinoDetalle(null);
          setError(err instanceof Error ? err.message : "Error al cargar depósito destino");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [destinoId, tipoMovimiento]);

  const refreshLista = async () => {
    const items = await apiFetch<TransferenciaListItem[]>("/transferencias?limit=30");
    setLista(items);
  };

  const crearPersonaRapida = async () => {
    const nombre = nuevaPersonaNombre.trim();
    if (!nombre) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<Persona>("/personas", {
        method: "POST",
        body: JSON.stringify({ nombre }),
      });
      setPersonas((prev) => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setPersonaDestinoId(created.id);
      setNuevaPersonaNombre("");
      toast.success("Persona agregada");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al crear persona";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const focusQtyInput = (activoId: string) => {
    requestAnimationFrame(() => {
      const el = qtyInputRefs.current[activoId];
      if (!el) return;
      el.focus();
      el.select();
    });
  };

  /** Fija el origen compartido del movimiento y alinea filas compatibles. */
  const applySharedOrigen = (
    depositoId: string,
    preferActivoId?: string,
    preferUbicacionId?: string,
  ) => {
    const nombre =
      stockByActivo.get(preferActivoId ?? "")?.find((d) => d.depositoId === depositoId)
        ?.depositoNombre ??
      (() => {
        for (const list of stockByActivo.values()) {
          const hit = list.find((s) => s.depositoId === depositoId);
          if (hit) return hit.depositoNombre;
        }
        return nombreDeposito(depositoId);
      })();

    const nextQty: Record<string, number> = {};
    const nextOrigen: Record<string, string> = {};
    const nextUbi: Record<string, string> = {};
    let removed = 0;

    const pickUbi = (activoId: string, preferred?: string) => {
      const slots = slotsForActivo(activoId, depositoId);
      if (slots.length === 0) return "";
      if (preferred && slots.some((s) => s.ubicacionId === preferred)) return preferred;
      if (slots.length === 1) return slots[0].ubicacionId;
      const prev = rowOrigenUbicacion[activoId];
      if (prev && slots.some((s) => s.ubicacionId === prev)) return prev;
      return "";
    };

    for (const [activoId, cantidad] of Object.entries(selectedQty)) {
      if (cantidad <= 0) continue;
      const ubi = pickUbi(
        activoId,
        activoId === preferActivoId ? preferUbicacionId : undefined,
      );
      const max = ubi
        ? disponibleEnDeposito(activoId, depositoId, { soloUbicacionId: ubi })
        : disponibleEnDeposito(activoId, depositoId);
      if (max <= 0) {
        removed += 1;
        continue;
      }
      nextQty[activoId] = Math.min(Math.max(1, cantidad), max);
      nextOrigen[activoId] = depositoId;
      if (ubi) nextUbi[activoId] = ubi;
    }

    if (preferActivoId) {
      const ubi = pickUbi(preferActivoId, preferUbicacionId);
      const maxPref = ubi
        ? disponibleEnDeposito(preferActivoId, depositoId, { soloUbicacionId: ubi })
        : disponibleEnDeposito(preferActivoId, depositoId);
      if (maxPref > 0) {
        nextQty[preferActivoId] = Math.min(
          Math.max(1, selectedQty[preferActivoId] ?? 1),
          maxPref,
        );
        nextOrigen[preferActivoId] = depositoId;
        if (ubi) nextUbi[preferActivoId] = ubi;
      }
    }

    setOrigenId(depositoId);
    setSelectedQty(nextQty);
    setRowOrigen(nextOrigen);
    setRowOrigenUbicacion(nextUbi);
    if (removed > 0) {
      setError(
        `Se quitaron ${removed} artículo${removed === 1 ? "" : "s"} sin stock en ${nombre}.`,
      );
    } else {
      setError(null);
    }
  };

  /** Selección de slot depósito+ubicación (value = "depId:ubiId"). */
  const setOrigenSlotForRow = (activoId: string, slotKey: string) => {
    if (!slotKey) return;
    const [depositoId, ubicacionId] = slotKey.includes(":")
      ? slotKey.split(":")
      : [slotKey, ""];
    if (!depositoId) return;
    const max = ubicacionId
      ? disponibleEnDeposito(activoId, depositoId, { soloUbicacionId: ubicacionId })
      : disponibleEnDeposito(activoId, depositoId);
    if (max <= 0) {
      setError("Sin stock disponible en ese origen.");
      return;
    }
    applySharedOrigen(depositoId, activoId, ubicacionId || undefined);
  };

  const addArticulo = (activo: Activo) => {
    const deposits = (stockByActivo.get(activo.id) ?? []).filter((d) => d.disponible > 0);
    if (deposits.length === 0) {
      setError("Este artículo no tiene unidades disponibles en ningún depósito.");
      return;
    }
    const already = (selectedQty[activo.id] ?? 0) > 0;
    if (already) {
      setError(null);
      setComboOpen(false);
      setStockSearch("");
      focusQtyInput(activo.id);
      return;
    }

    if (origenId) {
      const inOrigen = deposits.find((d) => d.depositoId === origenId);
      if (!inOrigen) {
        setError(
          `Todos los artículos deben salir del mismo depósito de origen (${origenDerivadoNombre || nombreDeposito(origenId)}).`,
        );
        return;
      }
      const slots = slotsForActivo(activo.id, origenId);
      const ubiAuto = slots.length === 1 ? slots[0].ubicacionId : "";
      const max = ubiAuto
        ? disponibleEnDeposito(activo.id, origenId, { soloUbicacionId: ubiAuto })
        : inOrigen.disponible;
      setError(null);
      setSelectedQty((prev) => ({
        ...prev,
        [activo.id]: Math.min(1, max > 0 ? max : 1),
      }));
      setRowOrigen((prev) => ({ ...prev, [activo.id]: origenId }));
      setRowOrigenUbicacion((prev) => {
        const next = { ...prev };
        if (ubiAuto) next[activo.id] = ubiAuto;
        else delete next[activo.id];
        return next;
      });
      setComboOpen(false);
      setStockSearch("");
      return;
    }

    const allSlots = slotsForActivo(activo.id);
    if (allSlots.length === 1) {
      applySharedOrigen(allSlots[0].depositoId, activo.id, allSlots[0].ubicacionId);
      setComboOpen(false);
      setStockSearch("");
      return;
    }

    if (deposits.length === 1) {
      const dep = deposits[0];
      const slots = slotsForActivo(activo.id, dep.depositoId);
      if (slots.length === 1) {
        applySharedOrigen(dep.depositoId, activo.id, slots[0].ubicacionId);
      } else {
        applySharedOrigen(dep.depositoId, activo.id);
      }
      setComboOpen(false);
      setStockSearch("");
      return;
    }

    // Varios depósitos / ubicaciones: fila sin origen hasta elegir en la tabla
    setError(null);
    setSelectedQty((prev) => ({ ...prev, [activo.id]: 1 }));
    setComboOpen(false);
    setStockSearch("");
  };

  const removeArticulo = (activoId: string) => {
    setSelectedQty((prev) => {
      const next = { ...prev };
      delete next[activoId];
      return next;
    });
    setRowOrigen((prev) => {
      const next = { ...prev };
      delete next[activoId];
      return next;
    });
    setRowOrigenUbicacion((prev) => {
      const next = { ...prev };
      delete next[activoId];
      return next;
    });
    setError(null);
  };

  const setSkuCantidad = (activoId: string, cantidad: number, max: number) => {
    if (max <= 0) return;
    const clamped = Math.max(1, Math.min(max, Math.floor(cantidad) || 1));
    setSelectedQty((prev) => ({ ...prev, [activoId]: clamped }));
  };

  const onComboKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const listOpen = comboOpen && stockSearch.trim().length > 0;
    if (e.key === "Escape") {
      if (comboOpen) {
        e.preventDefault();
        setComboOpen(false);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      if (!listOpen && stockSearch.trim()) {
        setComboOpen(true);
        return;
      }
      if (!listOpen || comboMatches.length === 0) return;
      e.preventDefault();
      setComboHighlight((i) => (i + 1) % comboMatches.length);
      return;
    }
    if (e.key === "ArrowUp") {
      if (!listOpen || comboMatches.length === 0) return;
      e.preventDefault();
      setComboHighlight((i) => (i - 1 + comboMatches.length) % comboMatches.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!listOpen || comboMatches.length === 0) return;
      const pick = comboMatches[Math.min(comboHighlight, comboMatches.length - 1)];
      if (pick) addArticulo(pick.activo);
    }
  };

  const crearMovimiento = async () => {
    const origen = origenId;
    if (!origen || !articulosConOrigenOk) {
      goCreateStep("articulos");
      setError("Seleccioná el origen (depósito y ubicación) en cada artículo");
      return;
    }
    if (unidadesSeleccionadas === 0) {
      goCreateStep("articulos");
      setError("Seleccioná al menos un artículo");
      return;
    }
    if (tipoMovimiento === "deposito") {
      if (!destinoId) {
        goCreateStep("datos");
        setError("Seleccioná el depósito destino");
        return;
      }
      if (!sectorDestinoId) {
        goCreateStep("datos");
        setError("Seleccioná el sector de destino");
        return;
      }
      if (!ubicacionDestinoId) {
        goCreateStep("datos");
        setError("Seleccioná la ubicación de destino");
        return;
      }
    } else if (!personaDestinoId) {
      goCreateStep("datos");
      setError("Seleccioná la persona destinataria");
      return;
    }
    const excluirUbi =
      tipoMovimiento === "deposito" && origen === destinoId ? ubicacionDestinoId : undefined;
    const lineas = Object.entries(selectedQty)
      .filter(([, cantidad]) => cantidad > 0)
      .map(([activo_id, cantidad]) => {
        const ubiOrigen = rowOrigenUbicacion[activo_id] || undefined;
        const max = disponibleEnDeposito(activo_id, origen, {
          excluirUbicacionId: excluirUbi,
          soloUbicacionId: ubiOrigen,
        });
        return {
          activo_id,
          cantidad,
          max,
          ubicacion_origen_id: ubiOrigen ?? null,
        };
      });
    const insuficientes = lineas.filter((l) => l.cantidad > l.max);
    if (insuficientes.length > 0) {
      goCreateStep(excluirUbi ? "datos" : "articulos");
      setError(
        excluirUbi
          ? "No hay suficientes unidades fuera de esa ubicación. Bajá la cantidad o elegí otro destino."
          : "No hay unidades suficientes en la ubicación de origen elegida",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payloadLineas = lineas.map(({ activo_id, cantidad, ubicacion_origen_id }) => ({
        activo_id,
        cantidad,
        ...(ubicacion_origen_id ? { ubicacion_origen_id } : {}),
      }));
      const payload: TransferenciaCreatePayload =
        tipoMovimiento === "persona"
          ? {
              tipo: "persona",
              deposito_origen_id: origen,
              persona_destino_id: personaDestinoId,
              lineas: payloadLineas,
              notas: notas.trim() || null,
            }
          : {
              tipo: "deposito",
              deposito_origen_id: origen,
              deposito_destino_id: destinoId,
              lineas: payloadLineas,
              ubicacion_destino_id: ubicacionDestinoId,
              notas: notas.trim() || null,
            };
      await apiFetch<Transferencia>("/transferencias", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSelectedQty({});
      setRowOrigen({});
      setRowOrigenUbicacion({});
      setOrigenId("");
      setSectorDestinoId("");
      setUbicacionDestinoId("");
      setNotas("");
      setShowCreate(false);
      setStockSearch("");
      setComboOpen(false);
      setCreateStep("articulos");
      toast.success(
        tipoMovimiento === "persona" ? "Entrega registrada" : "Movimiento registrado",
      );
      await refreshLista();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al crear el movimiento";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const avanzarADatos = () => {
    if (unidadesSeleccionadas === 0 || !origenId || !articulosConOrigenOk) {
      setError("Seleccioná al menos un artículo y el depósito de origen en cada fila");
      return;
    }
    setError(null);
    setComboOpen(false);
    if (tipoMovimiento === "deposito" && !destinoId && origenId) {
      setDestinoId(origenId);
    }
    goCreateStep("datos");
  };

  const avanzarAResumen = () => {
    if (!canAvanzarAResumen) {
      if (tipoMovimiento === "persona") {
        setError("Seleccioná la persona destinataria");
      } else if (!destinoId) {
        setError("Seleccioná el depósito destino");
      } else if (!sectorDestinoId) {
        setError("Seleccioná el sector de destino");
      } else if (!ubicacionDestinoId) {
        setError("Seleccioná la ubicación de destino");
      } else {
        setError("Completá los datos del destino");
      }
      return;
    }
    if (
      tipoMovimiento === "deposito" &&
      origenId &&
      destinoId === origenId &&
      ubicacionDestinoId
    ) {
      const sinStock = articulosSeleccionados.some(({ activo, cantidad }) => {
        const ubi = rowOrigenUbicacion[activo.id];
        return (
          disponibleEnDeposito(activo.id, origenId, {
            excluirUbicacionId: ubicacionDestinoId,
            soloUbicacionId: ubi || undefined,
          }) < cantidad
        );
      });
      if (sinStock) {
        setError(
          "En esa ubicación ya están todas las unidades elegidas. Elegí otra ubicación de destino.",
        );
        return;
      }
    }
    setError(null);
    goCreateStep("resumen");
  };

  const abrir = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<Transferencia>(`/transferencias/${id}`);
      setActiva(data);
      setShowCreate(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al abrir movimiento";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Movimientos"
        subtitle="Registrá traslados entre depósitos, ubicaciones o entregas a personas"
        leading={
          !loading && lista.length > 0 ? (
            <span>
              {listaFiltrada.length}
              {filtersActive ? ` / ${lista.length}` : ""}{" "}
              {listaFiltrada.length === 1 ? "movimiento" : "movimientos"}
            </span>
          ) : null
        }
      >
        <button
          type="button"
          className="btn secondary btn-sm"
          disabled={loading || busy}
          onClick={() => void loadBase()}
        >
          {loading ? "Cargando…" : "Actualizar"}
        </button>
        {perms.canWriteTransfer && (
          <button
            type="button"
            className="btn primary btn-sm"
            onClick={() => {
              setActiva(null);
              setError(null);
              setStockSearch("");
              setComboOpen(false);
              setSelectedQty({});
              setRowOrigen({});
              setRowOrigenUbicacion({});
              setOrigenId("");
              setSectorDestinoId("");
              setUbicacionDestinoId("");
              setCreateStep("articulos");
              setShowCreate(true);
            }}
          >
            + Nuevo movimiento
          </button>
        )}
      </PageHeader>

      {error && !showCreate && !activa && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="muted" aria-busy="true">
          Cargando…
        </p>
      )}

      <Modal
        open={showCreate && perms.canWriteTransfer}
        title="Nuevo movimiento"
        subtitle={
          createStep === "articulos"
            ? "Paso 1 · Elegí qué mover"
            : createStep === "datos"
              ? tipoMovimiento === "persona"
                ? "Paso 2 · Entrega a persona"
                : "Paso 2 · Destino y datos"
              : "Paso 3 · Resumen"
        }
        size="lg"
        className="activo-detalle-modal xfer-detalle-modal xfer-create-modal"
        onClose={() => {
          if (busy) return;
          setShowCreate(false);
          setError(null);
          setStockSearch("");
          setComboOpen(false);
          setCreateStep("articulos");
        }}
        closeOnEscape={!busy}
        closeOnBackdrop={!busy}
        footer={
          <div className="modal-footer-actions activo-detalle-footer xfer-create-footer">
            {error && showCreate && (
              <p className="error modal-inline-error" role="alert">
                {error}
              </p>
            )}
            {createStep === "articulos" && unidadesSeleccionadas > 0 && (
              <p className="xfer-create-footer-hint" aria-live="polite">
                <span className="xfer-create-sel-chip">
                  <strong>
                    {skusSeleccionados} SKU · {unidadesSeleccionadas} u.
                  </strong>
                  {origenDerivadoNombre ? (
                    <span className="muted"> · {origenDerivadoNombre}</span>
                  ) : null}
                </span>
              </p>
            )}
            <div className="activo-detalle-footer-btns">
              {createStep === "articulos" ? (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => {
                      setShowCreate(false);
                      setError(null);
                      setStockSearch("");
                      setComboOpen(false);
                      setCreateStep("articulos");
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    key="xfer-next-articulos"
                    type="button"
                    className="btn primary"
                    disabled={busy || unidadesSeleccionadas === 0 || !articulosConOrigenOk}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      avanzarADatos();
                    }}
                  >
                    Siguiente
                  </button>
                </>
              ) : createStep === "datos" ? (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => goCreateStep("articulos")}
                  >
                    Atrás
                  </button>
                  <button
                    key="xfer-next-datos"
                    type="button"
                    className="btn primary"
                    disabled={!canAvanzarAResumen}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      avanzarAResumen();
                    }}
                  >
                    Siguiente
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => goCreateStep("datos")}
                  >
                    Atrás
                  </button>
                  <button
                    key="xfer-finish"
                    type="button"
                    className="btn primary"
                    disabled={!canFinalizar}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void crearMovimiento();
                    }}
                  >
                    {busy
                      ? "Registrando…"
                      : tipoMovimiento === "persona"
                        ? "Registrar entrega"
                        : "Registrar movimiento"}
                  </button>
                </>
              )}
            </div>
          </div>
        }
      >
        <form
          id="form-crear-transferencia"
          className="activo-detalle xfer-detalle xfer-create"
          onSubmit={(e) => {
            // Nunca crear por submit implícito (Enter / botón swap). Solo Registrar.
            e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "TEXTAREA") return;
            // Combobox maneja Enter en su propio handler (preventDefault).
            if ((e.target as HTMLElement).getAttribute("role") === "combobox") return;
            e.preventDefault();
          }}
          aria-label="Crear movimiento"
        >
          <nav
            className="xfer-create-steps"
            aria-label="Pasos del movimiento"
            id={createStepsId}
          >
            {XFER_CREATE_STEPS.map((s, i) => {
              const stepIdx = CREATE_STEP_ORDER.indexOf(s.id);
              const currentIdx = CREATE_STEP_ORDER.indexOf(createStep);
              const done = stepIdx < currentIdx;
              const current = createStep === s.id;
              const className = `xfer-create-step${done ? " is-done" : ""}${
                current ? " is-current" : ""
              }`;
              const inner = (
                <>
                  <span className="xfer-create-step-num" aria-hidden="true">
                    {done ? (
                      <i className="bi bi-check2" aria-hidden="true" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="xfer-create-step-name">{s.short}</span>
                </>
              );
              return (
                <Fragment key={s.id}>
                  {i > 0 ? (
                    <span
                      className={`xfer-create-step-rail${
                        done || current ? " is-active" : ""
                      }`}
                      aria-hidden="true"
                    />
                  ) : null}
                  {done ? (
                    <button
                      type="button"
                      className={className}
                      onClick={() => goCreateStep(s.id)}
                      aria-label={`Volver a ${s.label}`}
                    >
                      {inner}
                    </button>
                  ) : (
                    <span
                      className={className}
                      aria-current={current ? "step" : undefined}
                    >
                      {inner}
                    </span>
                  )}
                </Fragment>
              );
            })}
          </nav>

          <div className="activo-detalle-body xfer-create-body">
            <div
              role="group"
              aria-label="Artículos a mover"
              className={`activo-detalle-panel xfer-create-panel${
                createStep === "articulos" ? " is-active" : ""
              }`}
              hidden={createStep !== "articulos"}
              aria-hidden={createStep !== "articulos"}
            >
              <div className="xfer-picker">
                <div className="xfer-combo" ref={comboWrapRef}>
                  <label className="field xfer-combo-field">
                    <span>Buscar artículo</span>
                    <input
                      role="combobox"
                      type="search"
                      value={stockSearch}
                      onChange={(e) => {
                        setStockSearch(e.target.value);
                        setComboOpen(true);
                      }}
                      onFocus={() => {
                        if (stockSearch.trim()) setComboOpen(true);
                      }}
                      onKeyDown={onComboKeyDown}
                      placeholder="SKU, descripción o depósito…"
                      aria-label="Buscar artículos para agregar"
                      aria-autocomplete="list"
                      aria-expanded={comboOpen && stockSearch.trim().length > 0}
                      aria-controls={createComboListId}
                      aria-activedescendant={
                        comboOpen && comboMatches[comboHighlight]
                          ? `${createComboListId}-opt-${comboMatches[comboHighlight].key}`
                          : undefined
                      }
                      autoComplete="off"
                      disabled={catalogoLoading}
                    />
                  </label>
                  {comboOpen && stockSearch.trim().length > 0 ? (
                    <ul
                      id={createComboListId}
                      role="listbox"
                      className="xfer-combo-list"
                      aria-label="Resultados de búsqueda"
                    >
                      {catalogoLoading ? (
                        <li className="xfer-combo-empty muted" role="presentation">
                          Cargando artículos…
                        </li>
                      ) : comboMatches.length === 0 ? (
                        <li className="xfer-combo-empty muted" role="presentation">
                          Sin coincidencias
                        </li>
                      ) : (
                        comboMatches.map((opt, idx) => {
                          const selected = (selectedQty[opt.activo.id] ?? 0) > 0;
                          const meta = origenId
                            ? `${disponibleEnDeposito(opt.activo.id, origenId)} disp.`
                            : opt.deposits.length === 1
                              ? `${opt.deposits[0].depositoNombre} · ${opt.deposits[0].disponible} disp.`
                              : `${opt.deposits.length} depósitos · ${opt.totalDisponible} disp.`;
                          return (
                            <li
                              key={opt.key}
                              id={`${createComboListId}-opt-${opt.key}`}
                              role="option"
                              aria-selected={idx === comboHighlight}
                              className={`xfer-combo-option${
                                idx === comboHighlight ? " is-active" : ""
                              }${selected ? " is-selected" : ""}`}
                              onMouseEnter={() => setComboHighlight(idx)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                addArticulo(opt.activo);
                              }}
                            >
                              <span className="xfer-combo-option-main">
                                <span className="mono xfer-combo-sku">
                                  {opt.activo.numero_patrimonial}
                                </span>
                                <span className="xfer-combo-desc">{opt.activo.descripcion}</span>
                              </span>
                              <span className="xfer-combo-option-meta muted">
                                {meta}
                                {selected ? " · en selección" : ""}
                              </span>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  ) : null}
                </div>

                {catalogoLoading ? (
                  <div className="xfer-catalog-empty" aria-busy="true">
                    <span className="xfer-catalog-empty-mark" aria-hidden="true" />
                    <p className="muted">Cargando catálogo…</p>
                  </div>
                ) : !catalogoDisponible ? (
                  <div className="xfer-catalog-empty" role="status">
                    <span className="xfer-catalog-empty-mark" aria-hidden="true" />
                    <p className="xfer-catalog-empty-title">Sin artículos para mover</p>
                    <p className="muted">
                      No hay unidades disponibles en depósitos activos. Asigná stock en
                      Depósitos o Activos para poder incluirlos en un movimiento.
                    </p>
                  </div>
                ) : articulosSeleccionados.length === 0 ? (
                  <div className="xfer-catalog-empty xfer-picker-hint" role="status">
                    <span className="xfer-catalog-empty-mark" aria-hidden="true" />
                    <p className="xfer-catalog-empty-title">Ningún artículo seleccionado</p>
                    <p className="muted">
                      Buscá por SKU o descripción y elegí un artículo. El origen
                      (depósito y ubicación) se elige en la tabla.
                    </p>
                  </div>
                ) : (
                  <div className="xfer-selected">
                    <div className="xfer-selected-head">
                      <p className="xfer-selected-title">Artículos seleccionados</p>
                      <p className="muted xfer-selected-meta">
                        {skusSeleccionados} SKU · {unidadesSeleccionadas} u.
                        {origenDerivadoNombre ? ` · Origen ${origenDerivadoNombre}` : ""}
                      </p>
                    </div>
                    <div className="table-wrap table-panel xfer-selected-table">
                      <table className="data-table dense sticky-head">
                        <thead>
                          <tr>
                            <th scope="col">SKU</th>
                            <th scope="col">Descripción</th>
                            <th scope="col">Origen</th>
                            <th scope="col" className="num">
                              Disponible
                            </th>
                            <th scope="col" className="num">
                              Cantidad
                            </th>
                            <th scope="col" className="col-actions">
                              <span className="sr-only">Quitar</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {articulosSeleccionados.map(
                            ({ activo: a, cantidad, deposits, origenRow }) => {
                              const slotsAll = slotsForActivo(a.id);
                              const slots = origenId
                                ? slotsForActivo(a.id, origenId)
                                : slotsAll;
                              const ubiRow = rowOrigenUbicacion[a.id] ?? "";
                              const slotKey =
                                origenRow && ubiRow ? `${origenRow}:${ubiRow}` : "";
                              const max =
                                origenRow && ubiRow
                                  ? disponibleEnDeposito(a.id, origenRow, {
                                      soloUbicacionId: ubiRow,
                                    })
                                  : origenRow
                                    ? disponibleEnDeposito(a.id, origenRow)
                                    : 0;
                              // Solo fijar texto si no hay otra opción posible en absoluto
                              const singleSlot = slotsAll.length === 1 && Boolean(slotKey);
                              const selectedSlot =
                                slotsAll.find((s) => s.key === slotKey) ??
                                slots.find((s) => s.key === slotKey);
                              const selectOptions = slotsAll;
                              return (
                                <tr key={a.id}>
                                  <td className="mono">{a.numero_patrimonial}</td>
                                  <td>{a.descripcion}</td>
                                  <td className="xfer-selected-origen">
                                    {singleSlot && selectedSlot ? (
                                      <span className="xfer-origen-fixed">
                                        {selectedSlot.label}
                                      </span>
                                    ) : (
                                      <select
                                        value={slotKey}
                                        onChange={(e) =>
                                          setOrigenSlotForRow(a.id, e.target.value)
                                        }
                                        aria-label={`Origen de ${a.numero_patrimonial}`}
                                        className="xfer-origen-select"
                                      >
                                        <option value="">Elegí ubicación de origen…</option>
                                        {selectOptions.map((s) => (
                                          <option key={s.key} value={s.key}>
                                            {s.label} ({s.disponible})
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </td>
                                  <td className="num">{max}</td>
                                  <td className="num xfer-selected-qty">
                                    {!origenRow || (slots.length > 0 && !ubiRow) || max <= 0 ? (
                                      <span className="muted">—</span>
                                    ) : max <= 1 ? (
                                      <span className="xfer-qty-fixed">1</span>
                                    ) : (
                                      <input
                                        ref={(el) => {
                                          qtyInputRefs.current[a.id] = el;
                                        }}
                                        type="number"
                                        min={1}
                                        max={max}
                                        value={cantidad}
                                        onChange={(e) =>
                                          setSkuCantidad(a.id, Number(e.target.value), max)
                                        }
                                        aria-label={`Cantidad a mover de ${a.numero_patrimonial}`}
                                      />
                                    )}
                                  </td>
                                  <td className="col-actions">
                                    <button
                                      type="button"
                                      className="btn ghost btn-sm xfer-remove-btn"
                                      aria-label={`Quitar ${a.numero_patrimonial}`}
                                      onClick={() => removeArticulo(a.id)}
                                    >
                                      <span aria-hidden="true">×</span>
                                    </button>
                                  </td>
                                </tr>
                              );
                            },
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              role="group"
              aria-label="Datos del movimiento"
              className={`activo-detalle-panel xfer-create-panel${
                createStep === "datos" ? " is-active" : ""
              }`}
              hidden={createStep !== "datos"}
              aria-hidden={createStep !== "datos"}
            >
              <fieldset className="xfer-type-fieldset">
                <legend>Tipo de movimiento</legend>
                <div className="xfer-type-options" role="radiogroup" aria-label="Tipo">
                  <label
                    className={`xfer-type-card${
                      tipoMovimiento === "deposito" ? " is-active" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="tipo-movimiento"
                      checked={tipoMovimiento === "deposito"}
                      onChange={() => setTipoMovimiento("deposito")}
                    />
                    <span className="xfer-type-card-radio" aria-hidden="true" />
                    <span className="xfer-type-card-body">
                      <span className="xfer-type-card-title">A depósito / ubicación</span>
                      <span className="muted xfer-type-card-desc">
                        Se registra al instante como completado (también interno)
                      </span>
                    </span>
                  </label>
                  <label
                    className={`xfer-type-card${
                      tipoMovimiento === "persona" ? " is-active" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="tipo-movimiento"
                      checked={tipoMovimiento === "persona"}
                      onChange={() => setTipoMovimiento("persona")}
                    />
                    <span className="xfer-type-card-radio" aria-hidden="true" />
                    <span className="xfer-type-card-body">
                      <span className="xfer-type-card-title">Entrega a persona</span>
                      <span className="muted xfer-type-card-desc">
                        Queda registrada al instante, sin tránsito
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>

              {tipoMovimiento === "deposito" ? (
                <div className="xfer-datos-block">
                  <p className="xfer-datos-heading">Destino</p>
                  <div className="xfer-datos-grid xfer-datos-cascade">
                    <label className="field">
                      <span>Depósito destino</span>
                      <select
                        value={destinoId}
                        onChange={(e) => setDestinoId(e.target.value)}
                        aria-label="Depósito destino"
                      >
                        {depositosDestinoOpciones.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.nombre}
                            {origenDerivadoId && d.id === origenDerivadoId
                              ? " (mismo depósito — elegí otra ubicación)"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Sector</span>
                      <select
                        value={sectorDestinoId}
                        onChange={(e) => {
                          setSectorDestinoId(e.target.value);
                          setUbicacionDestinoId("");
                        }}
                        disabled={!destinoId || sectoresDestino.length === 0}
                        aria-label="Sector destino"
                      >
                        <option value="">
                          {!destinoId
                            ? "Elegí depósito primero"
                            : sectoresDestino.length === 0
                              ? "Sin sectores en destino"
                              : "Elegí sector…"}
                        </option>
                        {sectoresDestino.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Ubicación</span>
                      <select
                        value={ubicacionDestinoId}
                        onChange={(e) => setUbicacionDestinoId(e.target.value)}
                        disabled={!sectorDestinoId || ubicacionesDestino.length === 0}
                        aria-label="Ubicación destino"
                      >
                        <option value="">
                          {!sectorDestinoId
                            ? "Elegí sector primero"
                            : ubicacionesDestino.length === 0
                              ? "Sin ubicaciones en el sector"
                              : "Elegí ubicación…"}
                        </option>
                        {ubicacionesDestino.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.codigo}
                          </option>
                        ))}
                      </select>
                    </label>
                    {destinoId && sectoresDestino.length === 0 ? (
                      <p className="muted xfer-datos-hint xfer-datos-span" role="status">
                        Este depósito no tiene sectores activos. Creá uno en Depósitos
                        antes de finalizar.
                      </p>
                    ) : sectorDestinoId && ubicacionesDestino.length === 0 ? (
                      <p className="muted xfer-datos-hint xfer-datos-span" role="status">
                        Este sector no tiene ubicaciones activas. Creá una en Depósitos
                        antes de finalizar.
                      </p>
                    ) : destinoId && origenDerivadoId && destinoId === origenDerivadoId ? (
                      <p className="muted xfer-datos-hint xfer-datos-span" role="status">
                        Movimiento interno: elegí un sector/ubicación distinto al actual de las
                        unidades. Al registrar queda completado al instante.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="xfer-datos-block">
                  <p className="xfer-datos-heading">Destinatario</p>
                  <div className="xfer-datos-stack">
                    <label className="field">
                      <span>Persona destinataria</span>
                      <select
                        value={personaDestinoId}
                        onChange={(e) => setPersonaDestinoId(e.target.value)}
                        aria-label="Persona destinataria"
                      >
                        {personas.length === 0 ? (
                          <option value="">Sin personas — creá una abajo</option>
                        ) : (
                          personas.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                              {p.documento ? ` (${p.documento})` : ""}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <div className="xfer-persona-rapida">
                      <label className="field">
                        <span>Agregar persona</span>
                        <input
                          value={nuevaPersonaNombre}
                          onChange={(e) => setNuevaPersonaNombre(e.target.value)}
                          maxLength={150}
                          placeholder="Nombre y apellido"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busy || !nuevaPersonaNombre.trim()}
                        onClick={() => void crearPersonaRapida()}
                      >
                        Guardar persona
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <label className="field xfer-notas-field">
                <span>Notas (opcional)</span>
                <input
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  maxLength={2000}
                  placeholder="Motivo o referencia interna"
                />
              </label>
            </div>

            <div
              role="group"
              aria-label="Resumen del movimiento"
              className={`activo-detalle-panel xfer-create-panel${
                createStep === "resumen" ? " is-active" : ""
              }`}
              hidden={createStep !== "resumen"}
              aria-hidden={createStep !== "resumen"}
            >
              <dl className="activo-detalle-grid xfer-resumen-grid">
                <div>
                  <dt>Tipo de movimiento</dt>
                  <dd>
                    {tipoMovimiento === "persona" ? "Entrega a persona" : "A depósito / ubicación"}
                  </dd>
                </div>
                <div>
                  <dt>Origen</dt>
                  <dd>{origenDerivadoNombre || "—"}</dd>
                </div>
                <div className="activo-detalle-span">
                  <dt>Destino</dt>
                  <dd>
                    {tipoMovimiento === "persona" ? (
                      personaDestinoNombre || "—"
                    ) : (
                      destinoResumenLabel || "—"
                    )}
                  </dd>
                </div>
                {notas.trim() ? (
                  <div className="activo-detalle-span">
                    <dt>Notas</dt>
                    <dd>{notas.trim()}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="xfer-resumen-articulos">
                <p className="xfer-datos-heading">Artículos</p>
                <div className="table-wrap table-panel xfer-selected-table">
                  <table className="data-table dense sticky-head">
                    <thead>
                      <tr>
                        <th scope="col">SKU</th>
                        <th scope="col">Descripción</th>
                        <th scope="col" className="num">
                          Cantidad
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {articulosSeleccionados.map(({ activo: a, cantidad }) => (
                        <tr key={a.id}>
                          <td className="mono">{a.numero_patrimonial}</td>
                          <td>{a.descripcion}</td>
                          <td className="num">{cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(activa)}
        title={activa?.tipo === "persona" ? "Entrega a persona" : "Movimiento a depósito"}
        subtitle={
          activa
            ? `${nombreDeposito(activa.deposito_origen_id)} → ${etiquetaDestino(activa)}`
            : undefined
        }
        size="lg"
        className="activo-detalle-modal xfer-detalle-modal"
        onClose={() => {
          if (busy) return;
          setActiva(null);
          setError(null);
        }}
        closeOnEscape={!busy}
        closeOnBackdrop={!busy}
        footer={
          activa ? (
            <div className="modal-footer-actions activo-detalle-footer">
              {error && (
                <p className="error modal-inline-error" role="alert">
                  {error}
                </p>
              )}
              <div className="xfer-detalle-footer-tools">
                <ExportButtons
                  basePath={`/reportes/transferencias/${activa.id}`}
                  filenameBase={`movimiento_${activa.id.slice(0, 8)}`}
                />
              </div>
              <div className="activo-detalle-footer-btns">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => {
                    setActiva(null);
                    setError(null);
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : null
        }
      >
        {activa && (
          <div className="activo-detalle xfer-detalle">
            <div
              className="activo-detalle-nav"
              role="tablist"
              aria-label="Secciones del movimiento"
            >
              {XFER_DETALLE_TABS.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`${xferTabsId}-tab-${t.id}`}
                  className={`activo-detalle-nav-tab${xferTab === t.id ? " active" : ""}`}
                  aria-selected={xferTab === t.id}
                  aria-controls={`${xferTabsId}-panel-${t.id}`}
                  tabIndex={xferTab === t.id ? 0 : -1}
                  ref={(el) => {
                    xferTabRefs.current[i] = el;
                  }}
                  onClick={() => selectXferTab(t.id)}
                  onKeyDown={(e) => onXferTabKeyDown(e, i)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="activo-detalle-body">
              <div
                role="tabpanel"
                id={`${xferTabsId}-panel-detalle`}
                aria-labelledby={`${xferTabsId}-tab-detalle`}
                className={`activo-detalle-panel${xferTab === "detalle" ? " is-active" : ""}`}
                hidden={xferTab !== "detalle"}
                aria-hidden={xferTab !== "detalle"}
              >
                {activa.tipo !== "persona" && (
                  <div className="xfer-status-steps" aria-label="Estado del movimiento">
                    <span
                      className={`xfer-step current ${
                        activa.estado === "completada"
                          ? "done"
                          : activa.estado === "cancelada"
                            ? "cancelled"
                            : ""
                      }`}
                    >
                      {estadoLabel(activa.estado)}
                    </span>
                  </div>
                )}

                <dl className="activo-detalle-grid">
                  <div>
                    <dt>Origen</dt>
                    <dd>{nombreDeposito(activa.deposito_origen_id)}</dd>
                  </div>
                  <div>
                    <dt>Destino</dt>
                    <dd>{etiquetaDestino(activa)}</dd>
                  </div>
                  <div>
                    <dt>Tipo</dt>
                    <dd>{activa.tipo === "persona" ? "Entrega a persona" : "Depósito"}</dd>
                  </div>
                  <div>
                    <dt>Estado</dt>
                    <dd>
                      <span className={`badge ${estadoBadgeClass(activa.estado)}`}>
                        {estadoLabel(activa.estado)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Creado</dt>
                    <dd>{new Date(activa.creado_en).toLocaleString("es-AR")}</dd>
                  </div>
                  {activa.usuario_nombre ? (
                    <div>
                      <dt>Por</dt>
                      <dd>{activa.usuario_nombre}</dd>
                    </div>
                  ) : null}
                  {activa.enviado_en ? (
                    <div>
                      <dt>Enviado</dt>
                      <dd>{new Date(activa.enviado_en).toLocaleString("es-AR")}</dd>
                    </div>
                  ) : null}
                  {activa.completado_en ? (
                    <div>
                      <dt>Completado</dt>
                      <dd>{new Date(activa.completado_en).toLocaleString("es-AR")}</dd>
                    </div>
                  ) : null}
                  {activa.notas ? (
                    <div className="activo-detalle-span">
                      <dt>Notas</dt>
                      <dd>{activa.notas}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div
                role="tabpanel"
                id={`${xferTabsId}-panel-articulos`}
                aria-labelledby={`${xferTabsId}-tab-articulos`}
                className={`activo-detalle-panel${xferTab === "articulos" ? " is-active" : ""}`}
                hidden={xferTab !== "articulos"}
                aria-hidden={xferTab !== "articulos"}
              >
                <ul className="simple-list compact-list">
                  {groupTransferDetalles(activa.detalles).map((g) => (
                    <li key={g.activo_id}>
                      <strong>{g.numero_patrimonial ?? "SKU"}</strong>
                      {g.descripcion && <span className="muted"> — {g.descripcion}</span>}
                      <span className="muted"> · {g.unidades} u.</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <section className="card">
        <div className="section-header">
          <h3>Historial de movimientos</h3>
          <div className="section-header-right">
            <ExportButtons
              basePath="/reportes/transferencias"
              filenameBase="movimientos"
              disabled={lista.length === 0}
            />
          </div>
        </div>

        {lista.length > 0 && (
          <div className="toolbar toolbar-compact" role="search" aria-label="Filtrar movimientos">
            <label className="field toolbar-field grow">
              <span className="sr-only">Buscar</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar origen, destino, persona…"
              />
            </label>
            <label className="field toolbar-field">
              <span className="sr-only">Estado</span>
              <select
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value)}
                aria-label="Estado"
              >
                <option value="">Estado</option>
                <option value="abiertas">Abiertas</option>
                <option value="pendiente">Pendiente</option>
                <option value="en_transito">En tránsito</option>
                <option value="completada">Completada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </label>
            {filtersActive && (
              <div className="toolbar-actions">
                <button type="button" className="btn secondary" onClick={clearFilters}>
                  Limpiar
                </button>
              </div>
            )}
          </div>
        )}

        {loading ? null : lista.length === 0 ? (
          <EmptyState
            title="Sin movimientos"
            description="Registrá traslados entre depósitos o entregas a personas. Cada movimiento se guarda completo al crear: qué se movió, cuándo, quién y hacia dónde."
            steps={[
              "Elegí si va a un depósito o a una persona",
              "Seleccioná el origen y los artículos",
              "Indicá el destino y registrá: queda finalizado al instante",
            ]}
            action={
              perms.canWriteTransfer ? (
                <button
                  type="button"
                  className="btn primary btn-sm"
                  onClick={() => {
                    setActiva(null);
                    setStockSearch("");
                    setComboOpen(false);
                    setSelectedQty({});
                    setRowOrigen({});
                    setRowOrigenUbicacion({});
                    setOrigenId("");
                    setSectorDestinoId("");
                    setUbicacionDestinoId("");
                    setCreateStep("articulos");
                    setShowCreate(true);
                  }}
                >
                  + Nuevo movimiento
                </button>
              ) : undefined
            }
          />
        ) : listaFiltrada.length === 0 ? (
          <EmptyState
            title="Sin coincidencias"
            description="Ningún movimiento coincide con los filtros actuales."
            action={
              <button type="button" className="btn secondary btn-sm" onClick={clearFilters}>
                Limpiar filtros
              </button>
            }
          />
        ) : (
          <div className="table-wrap table-panel">
            <table className="data-table dense sticky-head">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th className="num">Activos</th>
                  <th>Creada</th>
                  <th>Quién</th>
                  <th className="col-actions">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((t) => (
                  <tr
                    key={t.id}
                    className={[
                      "row-clickable",
                      activa?.id === t.id ? "row-active" : "",
                      t.estado === "pendiente" || t.estado === "en_transito" ? "row-warn" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      if (!busy) void abrir(t.id);
                    }}
                    title="Abrir movimiento"
                  >
                    <td>
                      <span className={`badge ${estadoBadgeClass(t.estado)}`}>
                        {estadoLabel(t.estado)}
                      </span>
                    </td>
                    <td>{t.tipo === "persona" ? "Persona" : "Depósito"}</td>
                    <td>{nombreDeposito(t.deposito_origen_id)}</td>
                    <td>{etiquetaDestino(t)}</td>
                    <td className="num">{t.total_activos}</td>
                    <td className="muted">
                      {new Date(t.creado_en).toLocaleString("es-AR")}
                    </td>
                    <td className="muted">{t.usuario_nombre ?? "—"}</td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn secondary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void abrir(t.id);
                          }}
                          disabled={busy}
                        >
                          Abrir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
