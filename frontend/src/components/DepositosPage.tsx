import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../context/ToastContext";
import type {
  Activo,
  Categoria,
  Deposito,
  DepositoCreatePayload,
  DepositoDetalle,
  Sector,
  SectorCreatePayload,
  StockDeposito,
  Ubicacion,
  UbicacionAsignada,
  UbicacionCreatePayload,
} from "../types";
import ActivoDetalleModal, { type ActivoEditPayload } from "./ActivoDetalleModal";
import ConfirmDialog from "./ConfirmDialog";
import DepositoForm from "./DepositoForm";
import ExportButtons from "./ExportButtons";
import EmptyState from "./EmptyState";
import Modal from "./Modal";
import PageHeader from "./PageHeader";
import SectorForm from "./SectorForm";
import UbicacionForm from "./UbicacionForm";
import { usePermissions } from "../lib/usePermissions";
import { groupStockBySku, skuCoincideBusqueda } from "../lib/groupStockBySku";
import type { AppPage } from "./DashboardPage";

function ubicacionAsignadaFromActivo(a: Activo): UbicacionAsignada | null {
  if (!a.ubicacion) return null;
  return {
    activo_id: a.id,
    ubicacion_id: a.ubicacion.ubicacion_id,
    ubicacion_codigo: a.ubicacion.ubicacion_codigo,
    sector_id: a.ubicacion.sector_id,
    sector_nombre: a.ubicacion.sector_nombre,
    deposito_id: a.ubicacion.deposito_id,
    deposito_nombre: a.ubicacion.deposito_nombre,
  };
}
type DeleteTarget =
  | { kind: "deposito"; id: string; label: string }
  | { kind: "sector"; id: string; label: string }
  | { kind: "ubicacion"; id: string; sectorId: string; label: string }
  | null;

type MenuAction = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
};

function PaneActionMenu({
  ariaLabel,
  actions,
}: {
  ariaLabel: string;
  actions: MenuAction[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div className="action-menu" ref={rootRef}>
      <button
        type="button"
        className="btn ghost btn-sm depot-pane-menu-btn"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ⋮
      </button>
      {open && (
        <div id={menuId} className="action-menu-panel" role="menu">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={action.danger ? "danger" : undefined}
              disabled={action.disabled}
              title={action.title}
              onClick={() => {
                if (action.disabled) return;
                setOpen(false);
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatStockUnits(n: number | null | undefined): string {
  if (n == null) return "…";
  return `${n} u.`;
}

function TreeRow({
  depth,
  selected,
  expanded,
  label,
  stockUnits,
  ariaLabel,
  onClick,
  menu,
}: {
  depth: 0 | 1 | 2;
  selected: boolean;
  expanded?: boolean;
  label: string;
  /** Unidades de stock en esta fila (depósito / sector / ubicación). */
  stockUnits?: number | null;
  ariaLabel?: string;
  onClick: () => void;
  menu?: ReactNode;
}) {
  const stockLabel = formatStockUnits(stockUnits);
  return (
    <div
      className={`depot-tree-row depth-${depth} ${selected ? "selected" : ""} ${expanded ? "expanded" : ""}`}
    >
      <button
        type="button"
        className="depot-tree-item"
        aria-current={selected ? "true" : undefined}
        aria-expanded={expanded}
        aria-label={ariaLabel ?? `${label}, ${stockLabel}`}
        onClick={onClick}
      >
        <span className="depot-tree-item-label">{label}</span>
        <span className="depot-tree-stock muted" title="Stock total">
          {stockLabel}
        </span>
      </button>
      {menu}
    </div>
  );
}

const TREE_ANIM_MS = 170;

/** Monta/desmonta hijos con expand/collapse corto; al cerrar limpia el DOM tras la transición. */
function AnimatedTreeChildren({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  const contentRef = useRef(children);
  if (open) contentRef.current = children;

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (open) {
      setMounted(true);
      if (reduceMotion) {
        setExpanded(true);
        return;
      }
      let cancelled = false;
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => {
          if (!cancelled) setExpanded(true);
        });
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(outer);
        if (inner) cancelAnimationFrame(inner);
      };
    }

    setExpanded(false);
    if (reduceMotion) {
      setMounted(false);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), TREE_ANIM_MS);
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={`depot-tree-branch${expanded ? " is-open" : ""}`}
      ref={(el) => {
        if (el) el.inert = !expanded;
      }}
      aria-hidden={!expanded}
    >
      <ul className="depot-tree-children" role="group">
        {contentRef.current}
      </ul>
    </div>
  );
}

export default function DepositosPage({
  onNavigate,
}: {
  onNavigate?: (page: AppPage) => void;
} = {}) {
  const toast = useToast();
  const perms = usePermissions();
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DepositoDetalle | null>(null);
  const [stock, setStock] = useState<StockDeposito | null>(null);
  const [loading, setLoading] = useState(true);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDeposito, setEditingDeposito] = useState<Deposito | null>(null);
  const [showSectorForm, setShowSectorForm] = useState(false);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [showUbicacionForm, setShowUbicacionForm] = useState(false);
  const [editingUbicacion, setEditingUbicacion] = useState<Ubicacion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [selectedUbicacionId, setSelectedUbicacionId] = useState<string | null>(null);
  const [stockSearch, setStockSearch] = useState("");
  /** Totales por depósito (todos) para filas del árbol sin abrir cada uno. */
  const [stockTotals, setStockTotals] = useState<Record<string, number>>({});
  const [viewingActivo, setViewingActivo] = useState<Activo | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [viewingBusy, setViewingBusy] = useState(false);
  const loadStockTotals = useCallback(async (deps: Deposito[]) => {
    if (deps.length === 0) {
      setStockTotals({});
      return;
    }
    const results = await Promise.all(
      deps.map(async (d) => {
        try {
          const s = await apiFetch<StockDeposito>(`/depositos/${d.id}/stock`);
          return [d.id, s.total] as const;
        } catch {
          return [d.id, 0] as const;
        }
      }),
    );
    setStockTotals(Object.fromEntries(results));
  }, []);

  const loadDepositos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Deposito[]>("/depositos");
      setDepositos(data);
      void loadStockTotals(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar depósitos");
      return [];
    } finally {
      setLoading(false);
    }
  }, [loadStockTotals]);

  const loadDetalle = useCallback(async (depositoId: string, opts?: { reset?: boolean }) => {
    if (opts?.reset) {
      setDetalle(null);
      setStock(null);
    }
    setDetalleLoading(true);
    try {
      const [tree, stockData] = await Promise.all([
        apiFetch<DepositoDetalle>(`/depositos/${depositoId}?include_tree=true`),
        apiFetch<StockDeposito>(`/depositos/${depositoId}/stock`),
      ]);
      setDetalle(tree);
      setStock(stockData);
      setStockTotals((prev) => ({ ...prev, [depositoId]: stockData.total }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar detalle");
      setDetalle(null);
      setStock(null);
    } finally {
      setDetalleLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDepositos();
  }, [loadDepositos]);

  useEffect(() => {
    if (selectedId) {
      loadDetalle(selectedId, { reset: true });
      setStockSearch("");
      setSelectedSectorId(null);
      setSelectedUbicacionId(null);
    } else {
      setDetalle(null);
      setStock(null);
    }
  }, [selectedId, loadDetalle]);

  const selectedSector = useMemo(
    () => detalle?.sectores.find((s) => s.id === selectedSectorId) ?? null,
    [detalle, selectedSectorId],
  );
  const selectedUbicacion = useMemo(
    () => selectedSector?.ubicaciones.find((u) => u.id === selectedUbicacionId) ?? null,
    [selectedSector, selectedUbicacionId],
  );
  const articulosUbicacion = useMemo(() => {
    if (!stock || !selectedUbicacionId) return [];
    const grouped = groupStockBySku(
      stock.activos.filter((a) => a.ubicacion_id === selectedUbicacionId),
    );
    const q = stockSearch.trim();
    if (!q) return grouped;
    return grouped.filter((g) => skuCoincideBusqueda(g, q));
  }, [stock, selectedUbicacionId, stockSearch]);

  const stockCountSector = useCallback(
    (sectorId: string) => {
      if (!stock || stock.deposito_id !== selectedId) return null;
      return stock.activos.filter((a) => a.sector_id === sectorId).length;
    },
    [stock, selectedId],
  );

  const stockCountUbicacion = useCallback(
    (ubicacionId: string) => {
      if (!stock || stock.deposito_id !== selectedId) return null;
      return stock.activos.filter((a) => a.ubicacion_id === ubicacionId).length;
    },
    [stock, selectedId],
  );

  const selectDeposito = (depositoId: string) => {
    if (selectedId === depositoId) {
      setSelectedId(null);
      setSelectedSectorId(null);
      setSelectedUbicacionId(null);
      setStockSearch("");
      return;
    }
    setSelectedId(depositoId);
  };

  const selectSector = (sectorId: string) => {
    if (selectedSectorId === sectorId) {
      setSelectedSectorId(null);
      setSelectedUbicacionId(null);
      setStockSearch("");
      return;
    }
    setSelectedSectorId(sectorId);
    setSelectedUbicacionId(null);
    setStockSearch("");
  };

  const selectUbicacion = (ubicacionId: string) => {
    if (selectedUbicacionId === ubicacionId) {
      setSelectedUbicacionId(null);
      setStockSearch("");
      return;
    }
    setSelectedUbicacionId(ubicacionId);
    setStockSearch("");
  };

  const openActivoDetalle = async (activoId: string) => {
    if (viewingBusy) return;
    setViewingBusy(true);
    setError(null);
    try {
      const [activo, cats] = await Promise.all([
        apiFetch<Activo>(`/activos/${activoId}`),
        categorias.length > 0
          ? Promise.resolve(categorias)
          : apiFetch<Categoria[]>("/categorias"),
      ]);
      if (categorias.length === 0) setCategorias(cats);
      setViewingActivo(activo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al abrir el artículo";
      setError(msg);
      toast.error(msg);
    } finally {
      setViewingBusy(false);
    }
  };

  const handleEditFromDetalle = async (activoId: string, data: ActivoEditPayload) => {
    const updated = await apiFetch<Activo>(`/activos/${activoId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    setViewingActivo(updated);
    toast.success("Artículo actualizado");
    if (selectedId) await loadDetalle(selectedId);
  };

  const refreshAfterActivoChange = async () => {
    if (viewingActivo) {
      try {
        const fresh = await apiFetch<Activo>(`/activos/${viewingActivo.id}`);
        setViewingActivo(fresh);
      } catch {
        /* keep current */
      }
    }
    if (selectedId) await loadDetalle(selectedId);
    await loadStockTotals(depositos);
  };

  const handleCreateDeposito = async (data: DepositoCreatePayload) => {
    const created = await apiFetch<Deposito>("/depositos", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setShowForm(false);
    setSelectedId(created.id);
    toast.success("Depósito creado");
    await loadDepositos();
  };

  const handleUpdateDeposito = async (data: DepositoCreatePayload) => {
    if (!editingDeposito) return;
    const id = editingDeposito.id;
    await apiFetch<Deposito>(`/depositos/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    setEditingDeposito(null);
    toast.success("Depósito actualizado");
    await loadDepositos();
    if (selectedId === id) {
      await loadDetalle(id);
    }
  };

  const handleCreateSector = async (data: SectorCreatePayload) => {
    if (!selectedId) return;
    await apiFetch(`/depositos/${selectedId}/sectores`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    setShowSectorForm(false);
    toast.success("Sector creado");
    await loadDetalle(selectedId);
  };

  const handleUpdateSector = async (data: SectorCreatePayload) => {
    if (!selectedId || !editingSector) return;
    await apiFetch(`/depositos/${selectedId}/sectores/${editingSector.id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    setEditingSector(null);
    toast.success("Sector actualizado");
    await loadDetalle(selectedId);
  };

  const handleCreateUbicacion = async (
    sectorId: string,
    data: UbicacionCreatePayload,
  ) => {
    if (!selectedId) return;
    await apiFetch(`/depositos/${selectedId}/sectores/${sectorId}/ubicaciones`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    setShowUbicacionForm(false);
    toast.success("Ubicación creada");
    await loadDetalle(selectedId);
  };

  const handleUpdateUbicacion = async (
    sectorId: string,
    data: UbicacionCreatePayload,
  ) => {
    if (!selectedId || !editingUbicacion) return;
    await apiFetch(
      `/depositos/${selectedId}/sectores/${sectorId}/ubicaciones/${editingUbicacion.id}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    );
    setEditingUbicacion(null);
    toast.success("Ubicación actualizada");
    await loadDetalle(selectedId);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind !== "deposito" && !selectedId) return;
    setDeleteBusy(true);
    setError(null);
    try {
      if (deleteTarget.kind === "deposito") {
        await apiFetch<void>(`/depositos/${deleteTarget.id}`, { method: "DELETE" });
        toast.success(`Depósito ${deleteTarget.label} eliminado`);
        setDeleteTarget(null);
        await loadDepositos();
        if (selectedId === deleteTarget.id) {
          setSelectedId(null);
          setSelectedSectorId(null);
          setSelectedUbicacionId(null);
        }
      } else if (deleteTarget.kind === "sector") {
        await apiFetch<void>(`/depositos/${selectedId}/sectores/${deleteTarget.id}`, {
          method: "DELETE",
        });
        toast.success(`Sector ${deleteTarget.label} eliminado`);
        setDeleteTarget(null);
        if (selectedSectorId === deleteTarget.id) {
          setSelectedSectorId(null);
          setSelectedUbicacionId(null);
        }
        await loadDetalle(selectedId!);
      } else {
        await apiFetch<void>(
          `/depositos/${selectedId}/sectores/${deleteTarget.sectorId}/ubicaciones/${deleteTarget.id}`,
          { method: "DELETE" },
        );
        toast.success(`Ubicación ${deleteTarget.label} eliminada`);
        setDeleteTarget(null);
        if (selectedUbicacionId === deleteTarget.id) {
          setSelectedUbicacionId(null);
        }
        await loadDetalle(selectedId!);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleteBusy(false);
    }
  };

  const deleteDescription = (() => {
    if (!deleteTarget) return "";
    if (deleteTarget.kind === "deposito") {
      return `¿Eliminar el depósito ${deleteTarget.label}? Debe estar vacío (sin stock, inventarios ni transferencias). Se borrarán también sus sectores y ubicaciones vacíos.`;
    }
    if (deleteTarget.kind === "sector") {
      return `¿Eliminar el sector ${deleteTarget.label}? No debe tener artículos en sus ubicaciones.`;
    }
    return `¿Eliminar la ubicación ${deleteTarget.label}? No debe tener artículos asignados.`;
  })();

  const treeMenuActions = useMemo((): MenuAction[] => {
    if (!perms.canWriteWarehouse) return [];
    const actions: MenuAction[] = [
      {
        label: "Nuevo depósito",
        onClick: () => {
          setEditingDeposito(null);
          setShowForm(true);
        },
      },
    ];
    if (detalle && selectedId) {
      actions.push(
        {
          label: "Editar depósito",
          onClick: () => setEditingDeposito(detalle),
        },
        {
          label: "Eliminar depósito",
          danger: true,
          onClick: () =>
            setDeleteTarget({
              kind: "deposito",
              id: detalle.id,
              label: detalle.nombre,
            }),
        },
        {
          label: "Nuevo sector",
          onClick: () => {
            setEditingSector(null);
            setShowSectorForm(true);
          },
        },
      );
    }
    if (selectedSector) {
      actions.push(
        {
          label: "Editar sector",
          onClick: () => setEditingSector(selectedSector),
        },
        {
          label: "Eliminar sector",
          danger: true,
          onClick: () =>
            setDeleteTarget({
              kind: "sector",
              id: selectedSector.id,
              label: selectedSector.nombre,
            }),
        },
        {
          label: "Nueva ubicación",
          onClick: () => {
            setEditingUbicacion(null);
            setShowUbicacionForm(true);
          },
        },
      );
    }
    if (selectedUbicacion && selectedSector) {
      actions.push(
        {
          label: "Editar ubicación",
          onClick: () => setEditingUbicacion(selectedUbicacion),
        },
        {
          label: "Eliminar ubicación",
          danger: true,
          onClick: () =>
            setDeleteTarget({
              kind: "ubicacion",
              id: selectedUbicacion.id,
              sectorId: selectedSector.id,
              label: selectedUbicacion.codigo,
            }),
        },
      );
    }
    return actions;
  }, [perms.canWriteWarehouse, detalle, selectedId, selectedSector, selectedUbicacion]);

  const pathLabel = [
    detalle?.nombre ?? depositos.find((d) => d.id === selectedId)?.nombre,
    selectedSector?.nombre,
    selectedUbicacion?.codigo,
  ]
    .filter(Boolean)
    .join(" → ");

  return (
    <div className="page">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <Modal
        open={(showForm || editingDeposito !== null) && perms.canWriteWarehouse}
        title={editingDeposito ? "Editar depósito" : "Alta de depósito"}
        size="md"
        onClose={() => {
          setShowForm(false);
          setEditingDeposito(null);
        }}
      >
        <DepositoForm
          initial={editingDeposito}
          onSubmit={editingDeposito ? handleUpdateDeposito : handleCreateDeposito}
          onCancel={() => {
            setShowForm(false);
            setEditingDeposito(null);
          }}
        />
      </Modal>

      <PageHeader
        title="Depósitos"
        subtitle="Sectores, ubicaciones y el stock en cada una"
        leading={
          !loading && depositos.length > 0 ? (
            <span>
              {depositos.length} depósito{depositos.length === 1 ? "" : "s"}
            </span>
          ) : null
        }
      >
        {perms.canWriteWarehouse && (
          <button
            type="button"
            className="btn primary btn-sm"
            onClick={() => {
              setEditingDeposito(null);
              setShowForm(true);
            }}
          >
            + Nuevo depósito
          </button>
        )}
      </PageHeader>

      <section className="card depot-workspace">
        {loading && (
          <p className="muted" aria-busy="true">
            Cargando depósitos…
          </p>
        )}
        {!loading && depositos.length === 0 && (
          <EmptyState
            title="Sin depósitos"
            description="La estructura depósito → sector → ubicación es la base del stock."
            steps={[
              "Creá el depósito (p. ej. Central)",
              "Agregá sectores",
              "Definí códigos de ubicación (A-01, …)",
            ]}
            action={
              perms.canWriteWarehouse ? (
                <button
                  type="button"
                  className="btn primary btn-sm"
                  onClick={() => setShowForm(true)}
                >
                  + Nuevo depósito
                </button>
              ) : undefined
            }
          />
        )}
        {!loading && depositos.length > 0 && (
          <>
            <div className="depot-drill-toolbar">
              <div className="depot-drill-context">
                <p className="depot-crumb" aria-live="polite">
                  {pathLabel || "Elegí un depósito"}
                </p>
                <p className="muted depot-meta" aria-live="polite">
                  {selectedId && (detalle?.direccion || detalle?.descripcion)
                    ? [detalle.direccion, detalle.descripcion].filter(Boolean).join(" · ")
                    : "\u00a0"}
                </p>
              </div>
              <div className="section-header-right depot-export-slot">
                <ExportButtons
                  basePath={
                    selectedId
                      ? `/reportes/stock/${selectedId}`
                      : "/reportes/stock/_"
                  }
                  filenameBase={
                    detalle ? `stock_${detalle.nombre}` : "stock"
                  }
                  disabled={!selectedId || !stock || stock.total === 0}
                />
              </div>
            </div>

            <div className="depot-split">
              <section className="depot-pane depot-pane-tree" aria-labelledby="drill-tree">
                <header className="depot-pane-head">
                  <h3 id="drill-tree">Estructura</h3>
                  <PaneActionMenu
                    ariaLabel="Acciones de estructura"
                    actions={treeMenuActions}
                  />
                </header>
                <ul className="depot-tree" role="tree" aria-label="Depósitos">
                  {depositos.map((d) => {
                    const isOpen = selectedId === d.id;
                    const sectores =
                      isOpen && detalle?.id === d.id ? detalle.sectores : [];
                    return (
                      <li key={d.id} role="treeitem" aria-expanded={isOpen}>
                        <TreeRow
                          depth={0}
                          selected={isOpen && !selectedSectorId}
                          expanded={isOpen}
                          label={d.nombre}
                          stockUnits={
                            isOpen && stock?.deposito_id === d.id
                              ? stock.total
                              : (stockTotals[d.id] ?? null)
                          }
                          onClick={() => selectDeposito(d.id)}
                        />
                        <AnimatedTreeChildren open={isOpen}>
                          {detalleLoading && detalle?.id !== d.id ? (
                            <li>
                              <p className="muted depot-pane-hint">Cargando…</p>
                            </li>
                          ) : sectores.length === 0 ? (
                            <li>
                              <p className="muted depot-pane-hint">
                                Sin sectores.
                                {perms.canWriteWarehouse ? " Usá ⋮ para crear uno." : ""}
                              </p>
                            </li>
                          ) : (
                            sectores.map((sector) => {
                              const sectorOpen = selectedSectorId === sector.id;
                              return (
                                <li
                                  key={sector.id}
                                  role="treeitem"
                                  aria-expanded={sectorOpen}
                                >
                                  <TreeRow
                                    depth={1}
                                    selected={sectorOpen && !selectedUbicacionId}
                                    expanded={sectorOpen}
                                    label={sector.nombre}
                                    stockUnits={stockCountSector(sector.id)}
                                    onClick={() => selectSector(sector.id)}
                                  />
                                  <AnimatedTreeChildren open={sectorOpen}>
                                    {sector.ubicaciones.length === 0 ? (
                                      <li>
                                        <p className="muted depot-pane-hint">
                                          Sin ubicaciones.
                                          {perms.canWriteWarehouse
                                            ? " Usá ⋮ para crear una."
                                            : ""}
                                        </p>
                                      </li>
                                    ) : (
                                      sector.ubicaciones.map((u) => {
                                        const ubiSelected = selectedUbicacionId === u.id;
                                        return (
                                          <li key={u.id} role="treeitem">
                                            <TreeRow
                                              depth={2}
                                              selected={ubiSelected}
                                              label={u.codigo}
                                              stockUnits={stockCountUbicacion(u.id)}
                                              onClick={() => selectUbicacion(u.id)}
                                            />
                                          </li>
                                        );
                                      })
                                    )}
                                  </AnimatedTreeChildren>
                                </li>
                              );
                            })
                          )}
                        </AnimatedTreeChildren>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="depot-pane depot-pane-articulos" aria-labelledby="drill-art">
                <header className="depot-pane-head">
                  <h3 id="drill-art">Artículos</h3>
                  {selectedUbicacion && (
                    <span className="muted">
                      {articulosUbicacion.reduce((n, g) => n + g.unidades, 0)} u.
                    </span>
                  )}
                </header>
                <div
                  key={selectedUbicacionId ?? "empty"}
                  className="depot-pane-body-in"
                >
                  {!selectedUbicacion ? (
                    <p className="muted depot-pane-hint">
                      Elegí una ubicación en el árbol para ver el stock.
                    </p>
                  ) : (
                    <>
                      {(stock?.activos.filter((a) => a.ubicacion_id === selectedUbicacionId)
                        .length ?? 0) > 6 && (
                        <label className="field depot-pane-search">
                          <span className="sr-only">Buscar artículos</span>
                          <input
                            value={stockSearch}
                            onChange={(e) => setStockSearch(e.target.value)}
                            placeholder="Buscar SKU…"
                          />
                        </label>
                      )}
                      {articulosUbicacion.length === 0 ? (
                        <p className="muted depot-pane-hint">
                          {stockSearch.trim()
                            ? "Ningún SKU coincide con la búsqueda."
                            : "Sin artículos en esta ubicación."}
                        </p>
                      ) : (
                        <ul className="depot-sku-list">
                          {articulosUbicacion.map((g) => (
                            <li key={g.activo_id}>
                              <button
                                type="button"
                                className="depot-sku-row"
                                disabled={viewingBusy}
                                onClick={() => void openActivoDetalle(g.activo_id)}
                                aria-label={`Ver artículo ${g.numero_patrimonial}`}
                              >
                                <strong className="mono">{g.numero_patrimonial}</strong>
                                <span className="muted"> — {g.descripcion}</span>
                                <span className="depot-sku-qty">{g.unidades} u.</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </section>

      <Modal
        open={(showSectorForm || editingSector !== null) && perms.canWriteWarehouse}
        title={editingSector ? "Editar sector" : "Nuevo sector"}
        size="md"
        onClose={() => {
          setShowSectorForm(false);
          setEditingSector(null);
        }}
      >
        <SectorForm
          initial={editingSector}
          onSubmit={editingSector ? handleUpdateSector : handleCreateSector}
          onCancel={() => {
            setShowSectorForm(false);
            setEditingSector(null);
          }}
        />
      </Modal>

      <Modal
        open={
          (showUbicacionForm || editingUbicacion !== null) &&
          perms.canWriteWarehouse &&
          Boolean(detalle)
        }
        title={editingUbicacion ? "Editar ubicación" : "Nueva ubicación"}
        size="md"
        onClose={() => {
          setShowUbicacionForm(false);
          setEditingUbicacion(null);
        }}
      >
        {detalle && (
          <UbicacionForm
            sectores={detalle.sectores}
            initial={editingUbicacion}
            fixedSectorId={editingUbicacion?.sector_id ?? selectedSectorId}
            onSubmit={editingUbicacion ? handleUpdateUbicacion : handleCreateUbicacion}
            onCancel={() => {
              setShowUbicacionForm(false);
              setEditingUbicacion(null);
            }}
          />
        )}
      </Modal>

      <ActivoDetalleModal
        open={Boolean(viewingActivo)}
        activo={viewingActivo}
        ubicacion={viewingActivo ? ubicacionAsignadaFromActivo(viewingActivo) : null}
        categorias={categorias}
        onClose={() => setViewingActivo(null)}
        canWriteAssets={perms.canWriteAssets}
        onEditSubmit={perms.canWriteAssets ? handleEditFromDetalle : undefined}
        onNavigate={onNavigate}
        onActivoChanged={() => void refreshAfterActivoChange()}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Confirmar eliminación"
        description={deleteDescription}
        confirmLabel="Eliminar"
        danger
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
