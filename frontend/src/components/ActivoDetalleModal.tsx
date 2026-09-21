import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../context/ToastContext";
import type {
  Activo,
  Categoria,
  EtiquetaLoteResponse,
  EtiquetaRow,
  HistorialEntry,
  MovimientoItem,
  MovimientosPage,
  Observacion,
  UbicacionAsignada,
} from "../types";
import type { AppPage } from "./DashboardPage";
import ActivoFotos from "./ActivoFotos";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import { usePermissions } from "../lib/usePermissions";
import { summarizeEvent } from "../lib/eventSummary";

interface ImpresoraConfig {
  host: string;
  port: number;
  simulate: boolean;
  timeout: number;
  actualizado_en: string | null;
  fuente: string;
}

interface ImpresoraEstado {
  status: string;
  mensaje: string;
  host: string;
  port: number;
  simulate: boolean;
  detalle: string | null;
}

export type ActivoEditPayload = {
  numero_patrimonial: string;
  descripcion: string;
  categoria_id: string;
  activo: boolean;
  serializado: boolean;
};

export type EtiquetaModo = "nueva" | "reposicion";

const HISTORIAL_ACCIONES = new Set([
  "creacion",
  "actualizacion",
  "desactivacion",
  "etiqueta_impresa",
  "etiqueta_codificada",
  "etiqueta_reposicion",
  "etiqueta_baja",
  "foto_agregada",
  "foto_eliminada",
  "ajuste_inventario",
]);

const MOVIMIENTO_ACCIONES = new Set([
  "transferencia",
  "entrega_persona",
  "asignacion_ubicacion",
  "desasignacion_ubicacion",
  "ajuste_inventario",
]);

type DetalleTab = "detalle" | "etiquetas" | "historial" | "movimientos" | "observaciones";
type EditableField = "descripcion" | "categoria_id" | "activo" | "serializado";

type DetalleDraft = {
  descripcion: string;
  categoria_id: string;
  activo: boolean;
  serializado: boolean;
};

const DETALLE_TABS: { id: DetalleTab; label: string }[] = [
  { id: "detalle", label: "Detalle" },
  { id: "etiquetas", label: "Etiquetas" },
  { id: "historial", label: "Historial" },
  { id: "movimientos", label: "Actividad" },
  { id: "observaciones", label: "Observaciones" },
];

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatUbicacion(ubicacion: UbicacionAsignada | null | undefined): string {
  if (!ubicacion) return "Sin ubicación";
  return `${ubicacion.deposito_nombre} / ${ubicacion.sector_nombre} / ${ubicacion.ubicacion_codigo}`;
}

function cambiosId(
  cambios: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!cambios) return null;
  const v = cambios[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function navTargetFromCambios(cambios: Record<string, unknown> | null): {
  inventarioId: string | null;
  transferenciaId: string | null;
} {
  return {
    inventarioId: cambiosId(cambios, "inventario_id"),
    transferenciaId:
      cambiosId(cambios, "transferencia_id") || cambiosId(cambios, "movimiento_id"),
  };
}

function draftFromActivo(activo: Activo): DetalleDraft {
  return {
    descripcion: activo.descripcion,
    categoria_id: activo.categoria_id,
    activo: activo.activo,
    serializado: Boolean(activo.serializado),
  };
}

function isDraftDirty(activo: Activo, draft: DetalleDraft): boolean {
  return (
    draft.descripcion.trim() !== activo.descripcion ||
    draft.categoria_id !== activo.categoria_id ||
    draft.activo !== activo.activo ||
    draft.serializado !== Boolean(activo.serializado)
  );
}

export interface ActivoDetalleModalProps {
  open: boolean;
  activo: Activo | null;
  ubicacion: UbicacionAsignada | null;
  categorias?: Categoria[];
  onClose: () => void;
  canWriteAssets?: boolean;
  onEditSubmit?: (activoId: string, data: ActivoEditPayload) => Promise<void>;
  onNavigate?: (page: AppPage) => void;
  /** Tras imprimir/codificar o guardar, para refrescar stock en la lista. */
  onActivoChanged?: () => void;
}

export default function ActivoDetalleModal({
  open,
  activo,
  ubicacion,
  categorias = [],
  onClose,
  canWriteAssets = false,
  onEditSubmit,
  onNavigate,
  onActivoChanged,
}: ActivoDetalleModalProps) {
  const toast = useToast();
  const perms = usePermissions();
  const canReadPrinter =
    perms.canWriteAssets || perms.canManageUsers || perms.canManageRoles;
  const canEditPrinter = perms.canManageUsers || perms.canManageRoles;
  const tabsId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [tab, setTab] = useState<DetalleTab>("detalle");
  const [draft, setDraft] = useState<DetalleDraft | null>(null);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const [historial, setHistorial] = useState<HistorialEntry[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState<string | null>(null);
  const [historialFocusId, setHistorialFocusId] = useState<string | null>(null);
  const historialFocusRef = useRef<HTMLLIElement | null>(null);

  const [movimientos, setMovimientos] = useState<MovimientoItem[]>([]);
  const [movimientosLoading, setMovimientosLoading] = useState(false);
  const [movimientosError, setMovimientosError] = useState<string | null>(null);
  const [movFocusId, setMovFocusId] = useState<string | null>(null);
  const movFocusRef = useRef<HTMLLIElement | null>(null);

  const [observaciones, setObservaciones] = useState<Observacion[]>([]);
  const [obsLoading, setObsLoading] = useState(false);
  const [obsError, setObsError] = useState<string | null>(null);
  const [obsTexto, setObsTexto] = useState("");
  const [obsBusy, setObsBusy] = useState(false);
  const [obsDeleteId, setObsDeleteId] = useState<string | null>(null);

  const [etiquetas, setEtiquetas] = useState<EtiquetaRow[]>([]);
  const [etiquetasLoading, setEtiquetasLoading] = useState(false);
  const [etiquetasError, setEtiquetasError] = useState<string | null>(null);
  const [etiqModo, setEtiqModo] = useState<EtiquetaModo>("nueva");
  const [etiqCantidad, setEtiqCantidad] = useState(1);
  const [etiqSeries, setEtiqSeries] = useState<string[]>([]);
  const [etiqBusy, setEtiqBusy] = useState(false);
  const [etiqError, setEtiqError] = useState<string | null>(null);
  const [lastLote, setLastLote] = useState<EtiquetaLoteResponse | null>(null);
  const [stockLocal, setStockLocal] = useState(0);
  const [deleteEtiquetaId, setDeleteEtiquetaId] = useState<string | null>(null);
  const [deleteEtiqBusy, setDeleteEtiqBusy] = useState(false);

  const [showPrinter, setShowPrinter] = useState(false);
  const [printerHost, setPrinterHost] = useState("192.168.1.20");
  const [printerPort, setPrinterPort] = useState(9100);
  const [printerSimulate, setPrinterSimulate] = useState(true);
  const [printerTimeout, setPrinterTimeout] = useState(5);
  const [printerMeta, setPrinterMeta] = useState<{
    fuente: string;
    actualizado_en: string | null;
  } | null>(null);
  const [printerEstado, setPrinterEstado] = useState<ImpresoraEstado | null>(null);
  const [printerLoading, setPrinterLoading] = useState(false);
  const [printerBusy, setPrinterBusy] = useState(false);
  const [printerError, setPrinterError] = useState<string | null>(null);

  const dirty = Boolean(activo && draft && isDraftDirty(activo, draft));

  const resetDraft = useCallback((a: Activo) => {
    setDraft(draftFromActivo(a));
    setEditingField(null);
    setSaveError(null);
  }, []);

  useEffect(() => {
    if (!open || !activo) return;
    setTab("detalle");
    resetDraft(activo);
    setConfirmDiscard(false);
    setHistorialFocusId(null);
    setMovFocusId(null);
    setObsTexto("");
    setObsError(null);
    setEtiqModo("nueva");
    setEtiqCantidad(1);
    setEtiqSeries([]);
    setEtiqError(null);
    setLastLote(null);
    setDeleteEtiquetaId(null);
    setShowPrinter(false);
    setPrinterError(null);
    setPrinterEstado(null);
    setStockLocal(activo.stock_etiquetas ?? 0);
  }, [open, activo?.id, resetDraft]); // eslint-disable-line react-hooks/exhaustive-deps -- baseline on open/id

  useEffect(() => {
    if (!activo) return;
    if (!dirty) {
      setDraft(draftFromActivo(activo));
      setEditingField(null);
      setStockLocal(activo.stock_etiquetas ?? 0);
    }
  }, [activo]); // eslint-disable-line react-hooks/exhaustive-deps -- sync when parent refreshes and clean

  const selectTab = (next: DetalleTab) => {
    setTab(next);
    if (next !== "detalle") setEditingField(null);
  };

  const startEdit = (field: EditableField) => {
    setEditingField(field);
    setSaveError(null);
  };

  const finishFieldEdit = () => {
    setEditingField(null);
  };

  const revertFieldEdit = (field: EditableField) => {
    if (!activo) return;
    setDraft((d) => {
      if (!d) return d;
      if (field === "descripcion") return { ...d, descripcion: activo.descripcion };
      if (field === "categoria_id") return { ...d, categoria_id: activo.categoria_id };
      if (field === "serializado") {
        return { ...d, serializado: Boolean(activo.serializado) };
      }
      return { ...d, activo: activo.activo };
    });
    setEditingField(null);
  };

  const onFieldKeyDown = (
    e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    field: EditableField,
  ) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      revertFieldEdit(field);
      return;
    }
    if (e.key === "Enter" && e.currentTarget.tagName !== "TEXTAREA") {
      e.preventDefault();
      finishFieldEdit();
    }
  };

  const renderInlineActions = (field: EditableField) => (
    <span className="activo-detalle-inline-actions">
      <button
        type="button"
        className="btn ghost btn-sm activo-detalle-inline-save"
        aria-label="Listo"
        title="Listo"
        disabled={saveBusy}
        onClick={finishFieldEdit}
      >
        <i className="bi bi-check-lg" aria-hidden />
      </button>
      <button
        type="button"
        className="btn ghost btn-sm"
        aria-label="Cancelar edición"
        title="Cancelar"
        disabled={saveBusy}
        onClick={() => revertFieldEdit(field)}
      >
        <i className="bi bi-x-lg" aria-hidden />
      </button>
    </span>
  );

  const renderEditPencil = (label: string, field: EditableField) => (
    <button
      type="button"
      className="activo-detalle-prop-edit"
      aria-label={label}
      title={label}
      disabled={saveBusy}
      onClick={() => startEdit(field)}
    >
      <i className="bi bi-pencil" aria-hidden />
    </button>
  );

  const loadHistorial = useCallback(async (activoId: string, signal?: AbortSignal) => {
    setHistorialLoading(true);
    setHistorialError(null);
    try {
      const data = await apiFetch<HistorialEntry[]>(`/activos/${activoId}/historial`, { signal });
      if (signal?.aborted) return;
      setHistorial(Array.isArray(data) ? data : []);
    } catch (err) {
      if (signal?.aborted) return;
      setHistorialError(err instanceof Error ? err.message : "Error al cargar historial");
      setHistorial([]);
    } finally {
      if (!signal?.aborted) setHistorialLoading(false);
    }
  }, []);

  const loadMovimientos = useCallback(async (activoId: string, signal?: AbortSignal) => {
    setMovimientosLoading(true);
    setMovimientosError(null);
    try {
      const data = await apiFetch<MovimientosPage>(
        `/movimientos?activo_id=${encodeURIComponent(activoId)}&limit=100`,
        { signal },
      );
      if (signal?.aborted) return;
      setMovimientos(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      if (signal?.aborted) return;
      setMovimientosError(err instanceof Error ? err.message : "Error al cargar movimientos");
      setMovimientos([]);
    } finally {
      if (!signal?.aborted) setMovimientosLoading(false);
    }
  }, []);

  const loadObservaciones = useCallback(async (activoId: string, signal?: AbortSignal) => {
    setObsLoading(true);
    setObsError(null);
    try {
      const data = await apiFetch<Observacion[]>(`/activos/${activoId}/observaciones`, { signal });
      if (signal?.aborted) return;
      setObservaciones(Array.isArray(data) ? data : []);
    } catch (err) {
      if (signal?.aborted) return;
      setObsError(err instanceof Error ? err.message : "Error al cargar observaciones");
      setObservaciones([]);
    } finally {
      if (!signal?.aborted) setObsLoading(false);
    }
  }, []);

  const loadEtiquetas = useCallback(async (activoId: string, signal?: AbortSignal) => {
    setEtiquetasLoading(true);
    setEtiquetasError(null);
    try {
      const data = await apiFetch<EtiquetaRow[]>(
        `/etiquetas?activo_id=${encodeURIComponent(activoId)}`,
        { signal },
      );
      if (signal?.aborted) return;
      setEtiquetas(Array.isArray(data) ? data : []);
    } catch (err) {
      if (signal?.aborted) return;
      setEtiquetasError(err instanceof Error ? err.message : "Error al cargar etiquetas");
      setEtiquetas([]);
    } finally {
      if (!signal?.aborted) setEtiquetasLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !activo) return;
    const ac = new AbortController();
    if (tab === "historial") void loadHistorial(activo.id, ac.signal);
    if (tab === "movimientos") void loadMovimientos(activo.id, ac.signal);
    if (tab === "observaciones") void loadObservaciones(activo.id, ac.signal);
    if (tab === "etiquetas") {
      void loadEtiquetas(activo.id, ac.signal);
      if (canReadPrinter) {
        void apiFetch<ImpresoraEstado>("/config/impresora/estado", { signal: ac.signal })
          .then((estado) => {
            if (!ac.signal.aborted) setPrinterEstado(estado);
          })
          .catch(() => {
            if (!ac.signal.aborted) setPrinterEstado(null);
          });
      }
    }
    return () => ac.abort();
  }, [
    open,
    activo,
    tab,
    canReadPrinter,
    loadHistorial,
    loadMovimientos,
    loadObservaciones,
    loadEtiquetas,
  ]);

  useEffect(() => {
    if (!historialFocusId || historialLoading) return;
    historialFocusRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [historialFocusId, historialLoading, historial]);

  useEffect(() => {
    if (!movFocusId || movimientosLoading) return;
    movFocusRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [movFocusId, movimientosLoading, movimientos]);

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % DETALLE_TABS.length;
    if (e.key === "ArrowLeft") next = (index - 1 + DETALLE_TABS.length) % DETALLE_TABS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = DETALLE_TABS.length - 1;
    selectTab(DETALLE_TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const handleIrHistorial = (entry: HistorialEntry) => {
    const { inventarioId, transferenciaId } = navTargetFromCambios(entry.cambios);
    if (inventarioId && onNavigate) {
      onNavigate("inventarios");
      toast.info("Abriendo inventarios");
      return;
    }
    if (transferenciaId && onNavigate) {
      onNavigate("transferencias");
      toast.info("Abriendo movimientos");
    }
  };

  const handleIrMovimiento = (m: MovimientoItem) => {
    const { inventarioId, transferenciaId } = navTargetFromCambios(m.cambios);
    if (
      (m.accion === "transferencia" || m.accion === "entrega_persona") &&
      transferenciaId &&
      onNavigate
    ) {
      onNavigate("transferencias");
      toast.info("Abriendo movimientos");
      return;
    }
    if (m.accion === "ajuste_inventario" && inventarioId && onNavigate) {
      onNavigate("inventarios");
      toast.info("Abriendo inventarios");
    }
  };

  const handleSave = async () => {
    if (!activo || !draft || !onEditSubmit || !dirty) return;
    const descripcion = draft.descripcion.trim();
    if (!descripcion) {
      setSaveError("La descripción no puede estar vacía.");
      return;
    }
    if (!draft.categoria_id) {
      setSaveError("Seleccioná una categoría.");
      return;
    }
    setSaveBusy(true);
    setSaveError(null);
    try {
      await onEditSubmit(activo.id, {
        numero_patrimonial: activo.numero_patrimonial,
        descripcion,
        categoria_id: draft.categoria_id,
        activo: draft.activo,
        serializado: draft.serializado,
      });
      toast.success("Cambios guardados");
      onActivoChanged?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaveBusy(false);
    }
  };

  const discardAndClose = () => {
    setConfirmDiscard(false);
    if (activo) resetDraft(activo);
    onClose();
  };

  const handleCancel = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const handleModalClose = () => {
    if (saveBusy || etiqBusy || obsBusy || deleteEtiqBusy) return;
    if (editingField) {
      revertFieldEdit(editingField);
      return;
    }
    handleCancel();
  };

  const confirmDeleteEtiqueta = async () => {
    if (!activo || !deleteEtiquetaId || !canWriteAssets) return;
    setDeleteEtiqBusy(true);
    setEtiqError(null);
    try {
      await apiFetch<void>(
        `/activos/${activo.id}/etiquetas/${deleteEtiquetaId}`,
        { method: "DELETE" },
      );
      setEtiquetas((prev) => prev.filter((e) => e.id !== deleteEtiquetaId));
      setStockLocal((s) => Math.max(0, s - 1));
      setDeleteEtiquetaId(null);
      toast.success("Etiqueta eliminada");
      onActivoChanged?.();
    } catch (err) {
      setEtiqError(err instanceof Error ? err.message : "Error al eliminar la etiqueta");
      setDeleteEtiquetaId(null);
    } finally {
      setDeleteEtiqBusy(false);
    }
  };

  const loadPrinterPanel = useCallback(async () => {
    if (!canReadPrinter) return;
    setPrinterLoading(true);
    setPrinterError(null);
    try {
      const [cfg, estado] = await Promise.all([
        apiFetch<ImpresoraConfig>("/config/impresora"),
        apiFetch<ImpresoraEstado>("/config/impresora/estado"),
      ]);
      setPrinterHost(cfg.host);
      setPrinterPort(cfg.port);
      setPrinterSimulate(cfg.simulate);
      setPrinterTimeout(cfg.timeout);
      setPrinterMeta({ fuente: cfg.fuente, actualizado_en: cfg.actualizado_en });
      setPrinterEstado(estado);
    } catch (err) {
      setPrinterError(err instanceof Error ? err.message : "Error al leer impresora");
    } finally {
      setPrinterLoading(false);
    }
  }, [canReadPrinter]);

  const refreshPrinterEstado = async () => {
    if (!canReadPrinter) return;
    setPrinterBusy(true);
    setPrinterError(null);
    try {
      const estado = await apiFetch<ImpresoraEstado>("/config/impresora/estado");
      setPrinterEstado(estado);
    } catch (err) {
      setPrinterError(err instanceof Error ? err.message : "Error al consultar estado");
    } finally {
      setPrinterBusy(false);
    }
  };

  const openPrinterSettings = () => {
    setShowPrinter(true);
    void loadPrinterPanel();
  };

  const savePrinter = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEditPrinter) return;
    setPrinterBusy(true);
    setPrinterError(null);
    try {
      const data = await apiFetch<ImpresoraConfig>("/config/impresora", {
        method: "PUT",
        body: JSON.stringify({
          host: printerHost.trim(),
          port: printerPort,
          simulate: printerSimulate,
          timeout: printerTimeout,
        }),
      });
      setPrinterHost(data.host);
      setPrinterPort(data.port);
      setPrinterSimulate(data.simulate);
      setPrinterTimeout(data.timeout);
      setPrinterMeta({ fuente: data.fuente, actualizado_en: data.actualizado_en });
      toast.success(
        data.simulate
          ? `Impresora · simulación · ${data.host}:${data.port}`
          : `Impresora · ${data.host}:${data.port}`,
      );
      const estado = await apiFetch<ImpresoraEstado>("/config/impresora/estado");
      setPrinterEstado(estado);
    } catch (err) {
      setPrinterError(err instanceof Error ? err.message : "Error al guardar impresora");
    } finally {
      setPrinterBusy(false);
    }
  };

  const handleAddObservacion = async (e: FormEvent) => {
    e.preventDefault();
    if (!activo || !canWriteAssets) return;
    const texto = obsTexto.trim();
    if (!texto) {
      setObsError("Escribí una nota antes de guardar.");
      return;
    }
    setObsBusy(true);
    setObsError(null);
    try {
      const created = await apiFetch<Observacion>(`/activos/${activo.id}/observaciones`, {
        method: "POST",
        body: JSON.stringify({ texto }),
      });
      setObservaciones((prev) => [created, ...prev]);
      setObsTexto("");
      toast.success("Observación agregada");
    } catch (err) {
      setObsError(err instanceof Error ? err.message : "Error al guardar la observación");
    } finally {
      setObsBusy(false);
    }
  };

  const handleDeleteObservacion = async (obsId: string) => {
    if (!activo || !canWriteAssets) return;
    setObsDeleteId(obsId);
    setObsError(null);
    try {
      await apiFetch<void>(`/activos/${activo.id}/observaciones/${obsId}`, { method: "DELETE" });
      setObservaciones((prev) => prev.filter((o) => o.id !== obsId));
      toast.success("Observación eliminada");
    } catch (err) {
      setObsError(err instanceof Error ? err.message : "Error al eliminar la observación");
    } finally {
      setObsDeleteId(null);
    }
  };

  const submitEtiquetas = async (imprimir: boolean) => {
    if (!activo || !canWriteAssets) return;
    if (etiqModo === "reposicion" && !imprimir) {
      setEtiqError("La reposición solo aplica a impresión.");
      return;
    }
    if (etiqModo === "reposicion" && stockLocal < etiqCantidad) {
      setEtiqError(
        stockLocal === 0
          ? "No hay etiquetas para reponer."
          : `Stock insuficiente: hay ${stockLocal}, pediste ${etiqCantidad}.`,
      );
      return;
    }
    const requiereSeries = Boolean(activo.serializado) && etiqModo === "nueva";
    if (requiereSeries) {
      const filled = etiqSeries.map((s) => s.trim()).filter(Boolean);
      if (filled.length !== etiqCantidad) {
        setEtiqError(`Ingresá ${etiqCantidad} número(s) de serie de fábrica.`);
        return;
      }
      const unique = new Set(filled.map((s) => s.toUpperCase()));
      if (unique.size !== filled.length) {
        setEtiqError("Hay series de fábrica duplicadas en el lote.");
        return;
      }
    }
    setEtiqBusy(true);
    setEtiqError(null);
    try {
      const path = imprimir
        ? `/activos/${activo.id}/imprimir-etiquetas`
        : `/activos/${activo.id}/etiquetas`;
      const body: {
        cantidad: number;
        modo: EtiquetaModo;
        series_fisicas?: string[];
      } = { cantidad: etiqCantidad, modo: etiqModo };
      if (requiereSeries) {
        body.series_fisicas = etiqSeries.map((s) => s.trim());
      }
      const data = await apiFetch<EtiquetaLoteResponse>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setLastLote(data);
      setStockLocal(data.stock_etiquetas);
      toast.success(
        etiqModo === "reposicion"
          ? `${data.cantidad} etiqueta(s) reimpresas · stock ${data.stock_etiquetas}`
          : imprimir
            ? `${data.cantidad} etiqueta(s) generadas e impresas · stock ${data.stock_etiquetas}`
            : `${data.cantidad} etiqueta(s) codificadas · stock ${data.stock_etiquetas}`,
      );
      await loadEtiquetas(activo.id);
      onActivoChanged?.();
    } catch (err) {
      setEtiqError(err instanceof Error ? err.message : "Error al procesar etiquetas");
    } finally {
      setEtiqBusy(false);
    }
  };

  const historialVisible = historial.filter(
    (e) => HISTORIAL_ACCIONES.has(e.accion) || e.accion.startsWith("foto_"),
  );
  const movimientosVisible = movimientos.filter((m) => MOVIMIENTO_ACCIONES.has(m.accion));

  const ubicacionResumen = formatUbicacion(ubicacion);
  const categoriasActivas = categorias.filter((c) => c.activa || c.id === activo?.categoria_id);
  const canEdit = canWriteAssets && Boolean(onEditSubmit) && Boolean(draft);
  const categoriaNombre =
    categorias.find((c) => c.id === draft?.categoria_id)?.nombre ??
    activo?.categoria.nombre ??
    "—";

  return (
    <>
      <Modal
        open={open && Boolean(activo)}
        title={activo?.numero_patrimonial ?? "Artículo"}
        subtitle={draft?.descripcion ?? activo?.descripcion}
        size="lg"
        className="activo-detalle-modal"
        onClose={handleModalClose}
        closeOnBackdrop={!saveBusy && !etiqBusy && !obsBusy && !deleteEtiqBusy && !printerBusy}
        closeOnEscape={
          !saveBusy &&
          !etiqBusy &&
          !obsBusy &&
          !confirmDiscard &&
          !deleteEtiquetaId &&
          !showPrinter
        }
        footer={
          canEdit || (tab === "etiquetas" && canReadPrinter) ? (
            <div className="modal-footer-actions activo-detalle-footer">
              {tab === "etiquetas" && canReadPrinter && (
                <p className="activo-detalle-footer-printer" title={printerEstado?.detalle ?? undefined}>
                  {printerEstado ? (
                    <>
                      <span
                        className={`activo-detalle-footer-dot ${
                          printerEstado.status === "ready" ||
                          printerEstado.status === "simulated"
                            ? "is-ok"
                            : printerEstado.status === "offline" ||
                                printerEstado.status === "unknown"
                              ? "is-warn"
                              : "is-err"
                        }`}
                        aria-hidden
                      />
                      <span className="muted">
                        Impresora: {printerEstado.mensaje}
                        {!printerEstado.simulate
                          ? ` · ${printerEstado.host}:${printerEstado.port}`
                          : ""}
                      </span>
                    </>
                  ) : (
                    <span className="muted">Impresora: …</span>
                  )}
                </p>
              )}
              <div className="activo-detalle-footer-btns">
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={saveBusy}
                      onClick={handleCancel}
                    >
                      Cancelar
                    </button>
                    {dirty && (
                      <button
                        type="button"
                        className="btn primary"
                        disabled={saveBusy}
                        onClick={() => void handleSave()}
                      >
                        {saveBusy ? "Guardando…" : "Guardar"}
                      </button>
                    )}
                  </>
                ) : (
                  <button type="button" className="btn secondary" onClick={onClose}>
                    Cerrar
                  </button>
                )}
              </div>
            </div>
          ) : undefined
        }
      >
        {activo && draft && (
          <div className="activo-detalle">
            <div
              className="activo-detalle-nav"
              role="tablist"
              aria-label="Secciones del artículo"
            >
              {DETALLE_TABS.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`${tabsId}-tab-${t.id}`}
                  className={`activo-detalle-nav-tab${tab === t.id ? " active" : ""}`}
                  aria-selected={tab === t.id}
                  aria-controls={`${tabsId}-panel-${t.id}`}
                  tabIndex={tab === t.id ? 0 : -1}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  onClick={() => selectTab(t.id)}
                  onKeyDown={(e) => onTabKeyDown(e, i)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="activo-detalle-body">
              <div
                role="tabpanel"
                id={`${tabsId}-panel-detalle`}
                aria-labelledby={`${tabsId}-tab-detalle`}
                className={`activo-detalle-panel${tab === "detalle" ? " is-active" : ""}`}
                hidden={tab !== "detalle"}
                aria-hidden={tab !== "detalle"}
              >
                {saveError && (
                  <p className="error" role="alert">
                    {saveError}
                  </p>
                )}

                <dl className="activo-detalle-grid">
                  <div>
                    <dt>Patrimonio</dt>
                    <dd>
                      <span className="mono">{activo.numero_patrimonial}</span>
                    </dd>
                  </div>

                  <div className="activo-detalle-prop">
                    <dt>Categoría</dt>
                    <dd>
                      {editingField === "categoria_id" && canEdit ? (
                        <div className="activo-detalle-inline-edit">
                          <select
                            value={draft.categoria_id}
                            autoFocus
                            aria-label="Categoría"
                            disabled={saveBusy || categoriasActivas.length === 0}
                            onChange={(e) =>
                              setDraft((d) => (d ? { ...d, categoria_id: e.target.value } : d))
                            }
                            onKeyDown={(e) => onFieldKeyDown(e, "categoria_id")}
                          >
                            {categoriasActivas.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre}
                              </option>
                            ))}
                          </select>
                          {renderInlineActions("categoria_id")}
                        </div>
                      ) : (
                        <div className="activo-detalle-value-row">
                          <span>{categoriaNombre}</span>
                          {canEdit && renderEditPencil("Editar categoría", "categoria_id")}
                        </div>
                      )}
                    </dd>
                  </div>

                  <div className="activo-detalle-prop activo-detalle-span">
                    <dt>Descripción</dt>
                    <dd>
                      {editingField === "descripcion" && canEdit ? (
                        <div className="activo-detalle-inline-edit">
                          <input
                            value={draft.descripcion}
                            maxLength={255}
                            autoFocus
                            aria-label="Descripción"
                            disabled={saveBusy}
                            onChange={(e) =>
                              setDraft((d) => (d ? { ...d, descripcion: e.target.value } : d))
                            }
                            onKeyDown={(e) => onFieldKeyDown(e, "descripcion")}
                          />
                          {renderInlineActions("descripcion")}
                        </div>
                      ) : (
                        <div className="activo-detalle-value-row">
                          <span>{draft.descripcion}</span>
                          {canEdit && renderEditPencil("Editar descripción", "descripcion")}
                        </div>
                      )}
                    </dd>
                  </div>

                  <div className="activo-detalle-prop">
                    <dt>Estado</dt>
                    <dd>
                      {editingField === "activo" && canEdit ? (
                        <div className="activo-detalle-inline-edit">
                          <select
                            value={draft.activo ? "true" : "false"}
                            autoFocus
                            aria-label="Estado"
                            disabled={saveBusy}
                            onChange={(e) =>
                              setDraft((d) =>
                                d ? { ...d, activo: e.target.value === "true" } : d,
                              )
                            }
                            onKeyDown={(e) => onFieldKeyDown(e, "activo")}
                          >
                            <option value="true">Activo</option>
                            <option value="false">Inactivo</option>
                          </select>
                          {renderInlineActions("activo")}
                        </div>
                      ) : (
                        <div className="activo-detalle-value-row">
                          <span>{draft.activo ? "Activo" : "Inactivo"}</span>
                          {canEdit && renderEditPencil("Editar estado", "activo")}
                        </div>
                      )}
                    </dd>
                  </div>

                  <div className="activo-detalle-prop">
                    <dt>Serializado</dt>
                    <dd>
                      {editingField === "serializado" && canEdit ? (
                        <div className="activo-detalle-inline-edit">
                          <select
                            value={draft.serializado ? "true" : "false"}
                            autoFocus
                            aria-label="Serializado"
                            disabled={saveBusy}
                            onChange={(e) =>
                              setDraft((d) =>
                                d
                                  ? { ...d, serializado: e.target.value === "true" }
                                  : d,
                              )
                            }
                            onKeyDown={(e) => onFieldKeyDown(e, "serializado")}
                          >
                            <option value="false">No</option>
                            <option value="true">Sí — pide S/N de fábrica</option>
                          </select>
                          {renderInlineActions("serializado")}
                        </div>
                      ) : (
                        <div className="activo-detalle-value-row">
                          <span>{draft.serializado ? "Sí" : "No"}</span>
                          {canEdit &&
                            renderEditPencil("Editar serializado", "serializado")}
                        </div>
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Stock</dt>
                    <dd>{stockLocal}</dd>
                  </div>

                  <div className="activo-detalle-span">
                    <dt>Ubicación</dt>
                    <dd>
                      <span className={ubicacion ? undefined : "text-warn"}>{ubicacionResumen}</span>
                      <p className="muted form-hint activo-detalle-hint">
                        Para cambiar la ubicación usá Movimientos.
                      </p>
                    </dd>
                  </div>

                  <div>
                    <dt>Creado</dt>
                    <dd>{formatFecha(activo.creado_en)}</dd>
                  </div>
                  <div>
                    <dt>Actualizado</dt>
                    <dd>{formatFecha(activo.actualizado_en)}</dd>
                  </div>
                </dl>

                <div className="activo-detalle-fotos">
                  <h4 className="activo-detalle-section-title">Fotos</h4>
                  <ActivoFotos activoId={activo.id} canWrite={canWriteAssets} />
                </div>
              </div>

              <div
                role="tabpanel"
                id={`${tabsId}-panel-etiquetas`}
                aria-labelledby={`${tabsId}-tab-etiquetas`}
                className={`activo-detalle-panel${tab === "etiquetas" ? " is-active" : ""}`}
                hidden={tab !== "etiquetas"}
                aria-hidden={tab !== "etiquetas"}
              >
                {etiqError && (
                  <p className="error" role="alert">
                    {etiqError}
                  </p>
                )}

                {canWriteAssets ? (
                  <section className="activo-detalle-etiq-print" aria-label="Imprimir etiquetas">
                    <div className="activo-detalle-etiq-print-top">
                      <div
                        className="activo-detalle-etiq-modes"
                        role="radiogroup"
                        aria-label="Tipo de etiqueta"
                      >
                        <button
                          type="button"
                          role="radio"
                          className={`activo-detalle-etiq-mode${etiqModo === "nueva" ? " is-active" : ""}`}
                          aria-checked={etiqModo === "nueva"}
                          disabled={etiqBusy}
                          onClick={() => {
                            setEtiqModo("nueva");
                            if (activo?.serializado) {
                              setEtiqSeries(
                                Array.from({ length: etiqCantidad }, (_, i) =>
                                  etiqSeries[i] ?? "",
                                ),
                              );
                            }
                          }}
                        >
                          <strong>Nueva</strong>
                          <span>Crea EPC y suma stock</span>
                        </button>
                        <button
                          type="button"
                          role="radio"
                          className={`activo-detalle-etiq-mode${etiqModo === "reposicion" ? " is-active" : ""}`}
                          aria-checked={etiqModo === "reposicion"}
                          disabled={etiqBusy}
                          onClick={() => {
                            setEtiqModo("reposicion");
                            setEtiqSeries([]);
                          }}
                        >
                          <strong>Reposición</strong>
                          <span>Reimprime sin sumar stock</span>
                        </button>
                      </div>
                      {canReadPrinter && (
                        <button
                          type="button"
                          className="btn ghost btn-sm activo-detalle-etiq-gear"
                          aria-label="Configurar impresora"
                          title="Configurar impresora"
                          disabled={etiqBusy}
                          onClick={openPrinterSettings}
                        >
                          <i className="bi bi-gear" aria-hidden />
                        </button>
                      )}
                    </div>

                    <div className="activo-detalle-etiq-toolbar">
                      <label className="field activo-detalle-etiq-qty">
                        <span>Cantidad</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          aria-label="Cantidad"
                          value={etiqCantidad}
                          disabled={etiqBusy}
                          onChange={(e) => {
                            const n = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                            setEtiqCantidad(n);
                            if (activo?.serializado && etiqModo === "nueva") {
                              setEtiqSeries((prev) => {
                                const next = [...prev];
                                while (next.length < n) next.push("");
                                return next.slice(0, n);
                              });
                            }
                          }}
                        />
                      </label>
                      <div className="activo-detalle-etiq-actions">
                        {etiqModo === "nueva" && (
                          <button
                            type="button"
                            className="btn secondary"
                            disabled={etiqBusy}
                            onClick={() => void submitEtiquetas(false)}
                          >
                            Solo codificar
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn primary"
                          disabled={etiqBusy}
                          onClick={() => void submitEtiquetas(true)}
                        >
                          {etiqBusy
                            ? "Procesando…"
                            : etiqModo === "reposicion"
                              ? "Reimprimir"
                              : "Imprimir"}
                        </button>
                      </div>
                    </div>

                    {Boolean(activo?.serializado) && etiqModo === "nueva" && (
                      <fieldset className="series-fisicas-fields">
                        <legend>Números de serie de fábrica</legend>
                        {(etiqSeries.length > 0
                          ? etiqSeries
                          : Array.from({ length: etiqCantidad }, () => "")
                        ).map((serie, idx) => (
                          <label key={idx} className="field">
                            <span>Serie #{idx + 1}</span>
                            <input
                              value={serie}
                              onChange={(e) => {
                                const next =
                                  etiqSeries.length === etiqCantidad
                                    ? [...etiqSeries]
                                    : Array.from({ length: etiqCantidad }, (_, i) =>
                                        etiqSeries[i] ?? "",
                                      );
                                next[idx] = e.target.value;
                                setEtiqSeries(next);
                              }}
                              required
                              maxLength={120}
                              disabled={etiqBusy}
                              autoComplete="off"
                              placeholder="S/N de fábrica"
                            />
                          </label>
                        ))}
                      </fieldset>
                    )}

                    {lastLote && (
                      <p className="activo-detalle-etiq-ok" role="status">
                        Listo · {lastLote.cantidad} u. · stock {lastLote.stock_etiquetas}
                      </p>
                    )}
                  </section>
                ) : (
                  <p className="muted">Tu rol no puede generar etiquetas.</p>
                )}

                <section className="activo-detalle-etiq-section" aria-label="Listado de etiquetas">
                  <h4 className="activo-detalle-section-title">
                    Etiquetas
                    {!etiquetasLoading && etiquetas.length > 0
                      ? ` · ${etiquetas.length}`
                      : ""}
                  </h4>
                  {etiquetasLoading && <p className="muted">Cargando etiquetas…</p>}
                  {etiquetasError && (
                    <p className="error" role="alert">
                      {etiquetasError}
                    </p>
                  )}
                  {!etiquetasLoading && !etiquetasError && etiquetas.length === 0 && (
                    <p className="muted">Sin etiquetas todavía.</p>
                  )}
                  {!etiquetasLoading && etiquetas.length > 0 && (
                    <div className="table-wrap table-panel activo-detalle-etiq-table">
                      <table className="data-table dense sticky-head">
                        <thead>
                          <tr>
                            <th>EPC</th>
                            <th>Serial EPC</th>
                            <th>Serie fábrica</th>
                            <th>Estado</th>
                            <th>Impresa</th>
                            {canWriteAssets && <th className="col-actions"> </th>}
                          </tr>
                        </thead>
                        <tbody>
                          {etiquetas.map((e) => (
                            <tr key={e.id}>
                              <td className="mono">{e.epc}</td>
                              <td className="mono">{e.serial_hex ?? "—"}</td>
                              <td className="mono">{e.serie_fisica ?? "—"}</td>
                              <td>
                                <span
                                  className={`badge ${e.estado === "activa" ? "ok" : "warn"}`}
                                >
                                  {e.estado}
                                </span>
                              </td>
                              <td>{e.impresa ? "Sí" : "No"}</td>
                              {canWriteAssets && (
                                <td className="col-actions">
                                  <div className="row-actions">
                                    <button
                                      type="button"
                                      className="btn ghost btn-sm danger-text activo-detalle-etiq-del"
                                      aria-label={`Eliminar etiqueta ${e.epc}`}
                                      title="Eliminar"
                                      disabled={etiqBusy || deleteEtiqBusy}
                                      onClick={() => setDeleteEtiquetaId(e.id)}
                                    >
                                      <i className="bi bi-trash3" aria-hidden />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>

              <div
                role="tabpanel"
                id={`${tabsId}-panel-historial`}
                aria-labelledby={`${tabsId}-tab-historial`}
                className={`activo-detalle-panel${tab === "historial" ? " is-active" : ""}`}
                hidden={tab !== "historial"}
                aria-hidden={tab !== "historial"}
              >
                {historialLoading && <p className="muted">Cargando historial…</p>}
                {historialError && (
                  <p className="error" role="alert">
                    {historialError}
                  </p>
                )}
                {!historialLoading && !historialError && historialVisible.length === 0 && (
                  <p className="muted">Todavía no hay eventos registrados para este artículo.</p>
                )}
                {!historialLoading && historialVisible.length > 0 && (
                  <ol className="evento-timeline" aria-label="Historial del artículo">
                    {historialVisible.map((entry) => {
                      const view = summarizeEvent(entry.accion, entry.cambios);
                      const focused = historialFocusId === entry.id;
                      const { inventarioId, transferenciaId } = navTargetFromCambios(
                        entry.cambios,
                      );
                      const canIr = Boolean(onNavigate && (inventarioId || transferenciaId));
                      return (
                        <li
                          key={entry.id}
                          ref={focused ? historialFocusRef : undefined}
                          className={`evento-item tone-${view.tone}${focused ? " is-focus" : ""}`}
                          aria-current={focused ? "true" : undefined}
                        >
                          <div className="evento-icon" aria-hidden>
                            <i className={`bi ${view.icon}`} />
                          </div>
                          <div className="evento-body">
                            <div className="evento-head">
                              <strong>{view.title}</strong>
                              <time dateTime={entry.creado_en} className="muted">
                                {formatFecha(entry.creado_en)}
                              </time>
                            </div>
                            {view.facts.length > 0 && (
                              <ul className="evento-facts">
                                {view.facts.map((f, i) => (
                                  <li key={`${entry.id}-${i}`}>{f}</li>
                                ))}
                              </ul>
                            )}
                            <div className="evento-meta">
                              <span className="muted">
                                <i className="bi bi-person" aria-hidden />{" "}
                                {entry.usuario_nombre ?? "Sistema"}
                              </span>
                              {canIr && view.linkLabel && (
                                <button
                                  type="button"
                                  className="btn ghost btn-sm"
                                  onClick={() => handleIrHistorial(entry)}
                                >
                                  {view.linkLabel}
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              <div
                role="tabpanel"
                id={`${tabsId}-panel-movimientos`}
                aria-labelledby={`${tabsId}-tab-movimientos`}
                className={`activo-detalle-panel${tab === "movimientos" ? " is-active" : ""}`}
                hidden={tab !== "movimientos"}
                aria-hidden={tab !== "movimientos"}
              >
                {movimientosLoading && <p className="muted">Cargando actividad…</p>}
                {movimientosError && (
                  <p className="error" role="alert">
                    {movimientosError}
                  </p>
                )}
                {!movimientosLoading && !movimientosError && movimientosVisible.length === 0 && (
                  <p className="muted">
                    Sin actividad de ubicación o stock. Las altas, impresiones y cambios de
                    datos están en Historial.
                  </p>
                )}
                {!movimientosLoading && movimientosVisible.length > 0 && (
                  <ol className="evento-timeline" aria-label="Actividad del artículo">
                    {movimientosVisible.map((m) => {
                      const view = summarizeEvent(m.accion, m.cambios);
                      const focused = movFocusId === m.id;
                      const { inventarioId, transferenciaId } = navTargetFromCambios(m.cambios);
                      const canIr =
                        Boolean(onNavigate) &&
                        (((m.accion === "transferencia" || m.accion === "entrega_persona") &&
                          Boolean(transferenciaId)) ||
                          (m.accion === "ajuste_inventario" && Boolean(inventarioId)));
                      return (
                        <li
                          key={m.id}
                          ref={focused ? movFocusRef : undefined}
                          className={`evento-item tone-${view.tone}${focused ? " is-focus" : ""}`}
                          aria-current={focused ? "true" : undefined}
                        >
                          <div className="evento-icon" aria-hidden>
                            <i className={`bi ${view.icon}`} />
                          </div>
                          <div className="evento-body">
                            <div className="evento-head">
                              <strong>{view.title}</strong>
                              <time dateTime={m.creado_en} className="muted">
                                {formatFecha(m.creado_en)}
                              </time>
                            </div>
                            {view.facts.length > 0 && (
                              <ul className="evento-facts">
                                {view.facts.map((f, i) => (
                                  <li key={`${m.id}-${i}`}>{f}</li>
                                ))}
                              </ul>
                            )}
                            <div className="evento-meta">
                              <span className="muted">
                                <i className="bi bi-person" aria-hidden />{" "}
                                {m.usuario_nombre ?? "Sistema"}
                              </span>
                              {canIr && view.linkLabel && (
                                <button
                                  type="button"
                                  className="btn ghost btn-sm"
                                  onClick={() => handleIrMovimiento(m)}
                                >
                                  {view.linkLabel}
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              <div
                role="tabpanel"
                id={`${tabsId}-panel-observaciones`}
                aria-labelledby={`${tabsId}-tab-observaciones`}
                className={`activo-detalle-panel activo-detalle-obs${tab === "observaciones" ? " is-active" : ""}`}
                hidden={tab !== "observaciones"}
                aria-hidden={tab !== "observaciones"}
              >
                {canWriteAssets && (
                  <form className="activo-obs-form" onSubmit={handleAddObservacion}>
                    <label className="field">
                      <span>Nueva observación</span>
                      <textarea
                        value={obsTexto}
                        onChange={(e) => setObsTexto(e.target.value)}
                        rows={3}
                        maxLength={4000}
                        placeholder="Escribí una nota…"
                        disabled={obsBusy}
                      />
                    </label>
                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn primary btn-sm"
                        disabled={obsBusy || !obsTexto.trim()}
                      >
                        {obsBusy ? "Guardando…" : "Agregar nota"}
                      </button>
                    </div>
                  </form>
                )}

                {obsLoading && <p className="muted">Cargando observaciones…</p>}
                {obsError && (
                  <p className="error" role="alert">
                    {obsError}
                  </p>
                )}
                {!obsLoading && observaciones.length === 0 && (
                  <p className="muted">
                    {canWriteAssets
                      ? "Sin observaciones. Agregá la primera nota."
                      : "Sin observaciones."}
                  </p>
                )}
                {!obsLoading && observaciones.length > 0 && (
                  <ul className="obs-list" aria-label="Observaciones del artículo">
                    {observaciones.map((o) => (
                      <li key={o.id} className="obs-item">
                        <div className="obs-item-head">
                          <span className="muted">{formatFecha(o.creado_en)}</span>
                          <span className="muted">{o.usuario_nombre ?? "Usuario"}</span>
                        </div>
                        <p className="obs-texto">{o.texto}</p>
                        {canWriteAssets && (
                          <button
                            type="button"
                            className="btn ghost btn-sm danger-text"
                            disabled={obsDeleteId === o.id}
                            onClick={() => void handleDeleteObservacion(o.id)}
                          >
                            {obsDeleteId === o.id ? "Eliminando…" : "Eliminar"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        title="Descartar cambios"
        description="Hay cambios sin guardar. Si cancelás, no se guardarán."
        confirmLabel="Descartar"
        cancelLabel="Volver"
        danger
        onConfirm={discardAndClose}
        onCancel={() => setConfirmDiscard(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteEtiquetaId)}
        title="Eliminar etiqueta"
        description={
          deleteEtiquetaId
            ? `¿Eliminar la etiqueta ${etiquetas.find((e) => e.id === deleteEtiquetaId)?.epc ?? ""}? Dejará de contar en el stock.`
            : undefined
        }
        confirmLabel="Eliminar"
        cancelLabel="Volver"
        danger
        busy={deleteEtiqBusy}
        onConfirm={() => void confirmDeleteEtiqueta()}
        onCancel={() => {
          if (!deleteEtiqBusy) setDeleteEtiquetaId(null);
        }}
      />

      <Modal
        open={open && showPrinter && canReadPrinter}
        title="Impresora"
        subtitle={
          printerMeta?.actualizado_en
            ? `Actualizado ${new Date(printerMeta.actualizado_en).toLocaleString("es-AR")}`
            : "Estado y conexión"
        }
        size="sm"
        onClose={() => {
          if (printerBusy) return;
          setShowPrinter(false);
        }}
        closeOnBackdrop={!printerBusy}
        closeOnEscape={!printerBusy}
        footer={
          <div className="modal-footer-actions">
            <button
              type="button"
              className="btn secondary"
              disabled={printerBusy}
              onClick={() => setShowPrinter(false)}
            >
              Cerrar
            </button>
            {canEditPrinter && (
              <button
                type="submit"
                form="form-impresora-detalle"
                className="btn primary"
                disabled={printerBusy || printerLoading}
              >
                {printerBusy ? "Guardando…" : "Guardar"}
              </button>
            )}
          </div>
        }
      >
        {printerError && (
          <p className="error" role="alert">
            {printerError}
          </p>
        )}

        <div className="activo-detalle-printer-status">
          <div className="activo-detalle-printer-status-row">
            <span className="muted">Estado</span>
            {printerLoading ? (
              <span className="muted">Consultando…</span>
            ) : printerEstado ? (
              <span
                className={`badge ${
                  printerEstado.status === "ready" || printerEstado.status === "simulated"
                    ? "ok"
                    : printerEstado.status === "offline" ||
                        printerEstado.status === "unknown"
                      ? "warn"
                      : "danger"
                }`}
              >
                {printerEstado.mensaje}
              </span>
            ) : (
              <span className="muted">—</span>
            )}
          </div>
          {printerEstado && (
            <p className="muted form-hint activo-detalle-hint">
              {printerEstado.host}:{printerEstado.port}
              {printerEstado.simulate ? " · simulación" : ""}
            </p>
          )}
          <button
            type="button"
            className="btn ghost btn-sm"
            disabled={printerBusy || printerLoading}
            onClick={() => void refreshPrinterEstado()}
          >
            Actualizar estado
          </button>
        </div>

        <form id="form-impresora-detalle" className="form" onSubmit={savePrinter}>
          <label className="field">
            <span>IP / host</span>
            <input
              value={printerHost}
              onChange={(e) => setPrinterHost(e.target.value)}
              placeholder="192.168.1.20"
              required
              disabled={printerBusy || !canEditPrinter}
              autoComplete="off"
            />
          </label>
          <div className="two-col">
            <label className="field">
              <span>Puerto</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={printerPort}
                onChange={(e) => setPrinterPort(Number(e.target.value) || 9100)}
                required
                disabled={printerBusy || !canEditPrinter}
              />
            </label>
            <label className="field">
              <span>Timeout (s)</span>
              <input
                type="number"
                min={1}
                max={60}
                value={printerTimeout}
                onChange={(e) => setPrinterTimeout(Number(e.target.value) || 5)}
                required
                disabled={printerBusy || !canEditPrinter}
              />
            </label>
          </div>
          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={printerSimulate}
              onChange={(e) => setPrinterSimulate(e.target.checked)}
              disabled={printerBusy || !canEditPrinter}
            />
            <span>Modo simulación (no enviar a la impresora)</span>
          </label>
          {!canEditPrinter && (
            <p className="muted form-hint">Tu rol puede ver el estado, no editar la conexión.</p>
          )}
        </form>
      </Modal>
    </>
  );
}
