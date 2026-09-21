import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../context/ToastContext";
import type {
  Activo,
  ActivoCreatePayload,
  Categoria,
  CategoriaCreatePayload,
  UbicacionAsignada,
} from "../types";
import ActivoDetalleModal, { type ActivoEditPayload } from "./ActivoDetalleModal";
import ActivoForm from "./ActivoForm";
import ActivosList from "./ActivosList";
import CategoriaForm from "./CategoriaForm";
import ConfirmDialog from "./ConfirmDialog";
import type { AppPage } from "./DashboardPage";
import EmptyState from "./EmptyState";
import ImprimirEtiquetasModal from "./ImprimirEtiquetasModal";
import Modal from "./Modal";
import PageHeader from "./PageHeader";
import {
  filterActivos,
  hasActiveActivosFilters,
  type UbicacionFilter,
} from "../lib/filterActivos";
import { usePermissions } from "../lib/usePermissions";

function ubicacionesFromActivos(lista: Activo[]): Record<string, UbicacionAsignada | null> {
  return Object.fromEntries(
    lista.map((a) => [
      a.id,
      a.ubicacion
        ? {
            activo_id: a.id,
            ubicacion_id: a.ubicacion.ubicacion_id,
            ubicacion_codigo: a.ubicacion.ubicacion_codigo,
            sector_id: a.ubicacion.sector_id,
            sector_nombre: a.ubicacion.sector_nombre,
            deposito_id: a.ubicacion.deposito_id,
            deposito_nombre: a.ubicacion.deposito_nombre,
          }
        : null,
    ]),
  );
}

type ArticulosTab = "catalogo" | "categorias";

const ARTICULOS_TABS: { id: ArticulosTab; label: string }[] = [
  { id: "catalogo", label: "Catálogo" },
  { id: "categorias", label: "Categorías" },
];

interface ActivosPageProps {
  onNavigate?: (page: AppPage) => void;
}

export default function ActivosPage({ onNavigate }: ActivosPageProps) {
  const toast = useToast();
  const perms = usePermissions();
  const tabsId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [tab, setTab] = useState<ArticulosTab>("catalogo");
  const [activos, setActivos] = useState<Activo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Record<string, UbicacionAsignada | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCategoriaForm, setShowCategoriaForm] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<Categoria | null>(null);
  const [confirmDeleteCategoriaId, setConfirmDeleteCategoriaId] = useState<string | null>(null);
  const [categoriaDeleteBusy, setCategoriaDeleteBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [ubicacionFilter, setUbicacionFilter] = useState<UbicacionFilter>("all");
  const [focusActivoId, setFocusActivoId] = useState<string | null>(null);
  const [pendingEtiquetas, setPendingEtiquetas] = useState<Activo | null>(null);
  const [showEtiquetasModal, setShowEtiquetasModal] = useState(false);
  const [etiquetasActivoId, setEtiquetasActivoId] = useState<string | null>(null);

  useEffect(() => {
    const flag = sessionStorage.getItem("dn_act_filter");
    if (flag === "sin") {
      setUbicacionFilter("sin");
      sessionStorage.removeItem("dn_act_filter");
    }
    const focusId = sessionStorage.getItem("dn_act_focus");
    const deepSearch = sessionStorage.getItem("dn_act_search");
    const tabFlag = sessionStorage.getItem("dn_act_tab");
    if (focusId) {
      setFocusActivoId(focusId);
      sessionStorage.removeItem("dn_act_focus");
    }
    if (deepSearch) {
      setSearch(deepSearch);
      sessionStorage.removeItem("dn_act_search");
    }
    if (tabFlag === "categorias") {
      setTab("categorias");
      sessionStorage.removeItem("dn_act_tab");
    }
    sessionStorage.removeItem("dn_act_open_historial");
    sessionStorage.removeItem("dn_act_historial_focus");
  }, []);

  const filterOpts = useMemo(
    () => ({ search, categoriaId: categoriaFilter, ubicacion: ubicacionFilter }),
    [search, categoriaFilter, ubicacionFilter],
  );
  const filtersActive = hasActiveActivosFilters(filterOpts);
  const activosFiltrados = useMemo(
    () => filterActivos(activos, ubicaciones, filterOpts),
    [activos, ubicaciones, filterOpts],
  );

  const clearFilters = () => {
    setSearch("");
    setCategoriaFilter("");
    setUbicacionFilter("all");
    setFocusActivoId(null);
  };

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [activosData, categoriasData] = await Promise.all([
        apiFetch<Activo[]>("/activos", { signal }),
        apiFetch<Categoria[]>("/categorias", { signal }),
      ]);
      if (signal?.aborted) return;
      setActivos(activosData);
      setCategorias(categoriasData);
      setUbicaciones(ubicacionesFromActivos(activosData));
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void loadData(ac.signal);
    return () => ac.abort();
  }, [loadData]);

  const closePanels = () => {
    setEditingId(null);
  };

  const handleCreateActivo = async (data: ActivoCreatePayload) => {
    const created = await apiFetch<Activo>("/activos", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setShowForm(false);
    toast.success("Artículo creado");
    await loadData();
    if (perms.canWriteAssets) {
      setPendingEtiquetas(created);
    }
  };

  const persistActivoUpdate = async (
    activoId: string,
    data: ActivoCreatePayload | ActivoEditPayload,
  ) => {
    setActionError(null);
    try {
      await apiFetch<Activo>(`/activos/${activoId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      toast.success("Artículo actualizado");
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al actualizar el artículo");
      throw err;
    }
  };

  const handleUpdateActivo = async (data: ActivoCreatePayload) => {
    if (!editingId) return;
    await persistActivoUpdate(editingId, data);
    setEditingId(null);
  };

  const handleEditFromDetalle = async (activoId: string, data: ActivoEditPayload) => {
    await persistActivoUpdate(activoId, data);
  };

  const handleCreateCategoria = async (data: CategoriaCreatePayload) => {
    await apiFetch<Categoria>("/categorias", {
      method: "POST",
      body: JSON.stringify(data),
    });
    toast.success("Categoría creada");
    await loadData();
  };

  const handleUpdateCategoria = async (data: CategoriaCreatePayload) => {
    if (!editingCategoria) return;
    await apiFetch<Categoria>(`/categorias/${editingCategoria.id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    setEditingCategoria(null);
    toast.success("Categoría actualizada");
    await loadData();
  };

  const confirmDeleteCategoria = async () => {
    if (!confirmDeleteCategoriaId) return;
    const cat = categorias.find((c) => c.id === confirmDeleteCategoriaId);
    setCategoriaDeleteBusy(true);
    setActionError(null);
    try {
      await apiFetch<void>(`/categorias/${confirmDeleteCategoriaId}`, { method: "DELETE" });
      setConfirmDeleteCategoriaId(null);
      toast.success(`${cat?.nombre ?? "Categoría"} eliminada`);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al eliminar la categoría");
    } finally {
      setCategoriaDeleteBusy(false);
    }
  };

  const handleView = (activoId: string) => {
    setActionError(null);
    setShowForm(false);
    setEditingId(null);
    setViewingId(activoId);
  };

  const handleToggleEdit = (activoId: string) => {
    setActionError(null);
    setShowForm(false);
    setEditingId((current) => (current === activoId ? null : activoId));
  };

  const handleDelete = async (activoId: string) => {
    setConfirmDeleteId(activoId);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    const activoId = confirmDeleteId;
    const activo = activos.find((a) => a.id === activoId);
    const label = activo?.numero_patrimonial ?? "este artículo";
    setDeleteBusy(true);
    setActionError(null);
    try {
      await apiFetch<void>(`/activos/${activoId}`, { method: "DELETE" });
      if (editingId === activoId || viewingId === activoId) {
        closePanels();
        setViewingId(null);
      }
      setConfirmDeleteId(null);
      toast.success(`${label} eliminado`);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al eliminar el artículo");
    } finally {
      setDeleteBusy(false);
    }
  };

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (
      e.key !== "ArrowRight" &&
      e.key !== "ArrowLeft" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % ARTICULOS_TABS.length;
    if (e.key === "ArrowLeft") next = (index - 1 + ARTICULOS_TABS.length) % ARTICULOS_TABS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = ARTICULOS_TABS.length - 1;
    setTab(ARTICULOS_TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const openEtiquetasModal = (activoId?: string | null) => {
    const preferred = activoId ?? editingId ?? focusActivoId ?? null;
    setEtiquetasActivoId(preferred);
    setShowEtiquetasModal(true);
  };

  const editingActivo = activos.find((a) => a.id === editingId) ?? null;
  const viewingActivo = activos.find((a) => a.id === viewingId) ?? null;

  return (
    <div className="page">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}

      <Modal
        open={showForm && perms.canWriteAssets}
        title="Alta de artículo"
        size="md"
        onClose={() => setShowForm(false)}
      >
        <ActivoForm
          categorias={categorias}
          onSubmit={handleCreateActivo}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      <Modal
        open={Boolean(editingActivo && perms.canWriteAssets)}
        title={editingActivo ? `Editar — ${editingActivo.numero_patrimonial}` : "Editar artículo"}
        size="md"
        onClose={() => setEditingId(null)}
      >
        {editingActivo && (
          <ActivoForm
            key={editingActivo.id}
            categorias={categorias}
            initial={editingActivo}
            onSubmit={handleUpdateActivo}
            onCancel={() => setEditingId(null)}
            submitLabel="Guardar cambios"
          />
        )}
      </Modal>

      <ActivoDetalleModal
        open={Boolean(viewingActivo)}
        activo={viewingActivo}
        ubicacion={viewingActivo ? (ubicaciones[viewingActivo.id] ?? null) : null}
        categorias={categorias}
        onClose={() => setViewingId(null)}
        canWriteAssets={perms.canWriteAssets}
        onEditSubmit={perms.canWriteAssets ? handleEditFromDetalle : undefined}
        onNavigate={onNavigate}
        onActivoChanged={() => void loadData()}
      />

      <PageHeader
        title="Artículos"
        subtitle="Buscá, ubicá y organizá tu stock"
        tabs={
          <div className="tabs" role="tablist" aria-label="Secciones de artículos">
            {ARTICULOS_TABS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${tabsId}-tab-${t.id}`}
                className={`tab ${tab === t.id ? "active" : ""}`}
                aria-selected={tab === t.id}
                aria-controls={`${tabsId}-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        {tab === "catalogo" ? (
          <>
            <button
              type="button"
              className="btn secondary btn-sm"
              disabled={loading}
              onClick={() => void loadData()}
            >
              {loading ? "Cargando…" : "Actualizar"}
            </button>
            {perms.canWriteAssets && (
              <button
                type="button"
                className="btn primary btn-sm"
                onClick={() => {
                  closePanels();
                  setViewingId(null);
                  setShowForm(true);
                }}
              >
                + Nuevo artículo
              </button>
            )}
          </>
        ) : perms.canWriteAssets ? (
          <button
            type="button"
            className="btn primary btn-sm"
            onClick={() => {
              setEditingCategoria(null);
              setShowCategoriaForm(true);
            }}
          >
            + Nueva categoría
          </button>
        ) : (
          <span className="muted">Solo lectura</span>
        )}
      </PageHeader>

      {tab === "catalogo" && (
        <section
          className="card"
          role="tabpanel"
          id={`${tabsId}-panel-catalogo`}
          aria-labelledby={`${tabsId}-tab-catalogo`}
        >
          {!loading && activos.length > 0 ? (
            <p className="muted depot-meta">
              {activosFiltrados.length}
              {filtersActive ? ` / ${activos.length}` : ""} artículo
              {activosFiltrados.length === 1 ? "" : "s"}
            </p>
          ) : null}
          {activos.length > 0 && (
            <div className="toolbar toolbar-compact" role="search" aria-label="Filtrar artículos">
              <label className="field toolbar-field grow">
                <span className="sr-only">Buscar</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar patrimonial, EPC, descripción…"
                />
              </label>
              <label className="field toolbar-field">
                <span className="sr-only">Categoría</span>
                <select
                  value={categoriaFilter}
                  onChange={(e) => setCategoriaFilter(e.target.value)}
                  aria-label="Categoría"
                >
                  <option value="">Categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field toolbar-field">
                <span className="sr-only">Ubicación</span>
                <select
                  value={ubicacionFilter}
                  onChange={(e) => setUbicacionFilter(e.target.value as UbicacionFilter)}
                  aria-label="Ubicación"
                >
                  <option value="all">Ubicación</option>
                  <option value="con">Con ubicación</option>
                  <option value="sin">Sin ubicación</option>
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

          {!loading && activos.length > 0 && activosFiltrados.length === 0 ? (
            <EmptyState
              title="Sin coincidencias"
              description="Ningún artículo coincide con los filtros actuales."
              action={
                <button type="button" className="btn secondary btn-sm" onClick={clearFilters}>
                  Limpiar filtros
                </button>
              }
            />
          ) : (
            <ActivosList
              activos={activosFiltrados}
              ubicaciones={ubicaciones}
              loading={loading}
              viewingId={viewingId}
              editingId={editingId}
              focusId={focusActivoId}
              onView={handleView}
              onEdit={handleToggleEdit}
              onPrint={(id) => openEtiquetasModal(id)}
              onDelete={handleDelete}
              canWriteAssets={perms.canWriteAssets}
              onCreateRequest={
                perms.canWriteAssets
                  ? () => {
                      closePanels();
                      setViewingId(null);
                      setShowForm(true);
                    }
                  : undefined
              }
            />
          )}
        </section>
      )}

      {tab === "categorias" && (
        <section
          className="card"
          role="tabpanel"
          id={`${tabsId}-panel-categorias`}
          aria-labelledby={`${tabsId}-tab-categorias`}
        >
          {!loading && categorias.length > 0 ? (
            <p className="muted depot-meta">
              {categorias.length} categoría{categorias.length === 1 ? "" : "s"}
            </p>
          ) : null}
          {!loading && categorias.length > 0 && (
            <div className="table-wrap table-panel">
              <table className="data-table dense sticky-head">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th className="col-hide-sm">Descripción</th>
                    {perms.canWriteAssets && (
                      <th className="col-actions">
                        <span className="sr-only">Acciones</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {categorias.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.nombre}</strong>
                      </td>
                      <td className="col-hide-sm muted">{c.descripcion || "—"}</td>
                      {perms.canWriteAssets && (
                        <td className="col-actions">
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn secondary btn-sm"
                              onClick={() => {
                                setShowCategoriaForm(false);
                                setEditingCategoria(c);
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn ghost btn-sm danger-text"
                              onClick={() => {
                                setActionError(null);
                                setConfirmDeleteCategoriaId(c.id);
                              }}
                            >
                              Eliminar
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
          {!loading && categorias.length === 0 && (
            <EmptyState
              title="Sin categorías"
              description="Creá categorías para clasificar los artículos del inventario."
              action={
                perms.canWriteAssets ? (
                  <button
                    type="button"
                    className="btn primary btn-sm"
                    onClick={() => {
                      setEditingCategoria(null);
                      setShowCategoriaForm(true);
                    }}
                  >
                    + Nueva categoría
                  </button>
                ) : undefined
              }
            />
          )}
        </section>
      )}

      <Modal
        open={(showCategoriaForm || editingCategoria !== null) && perms.canWriteAssets}
        title={editingCategoria ? "Editar categoría" : "Nueva categoría"}
        size="sm"
        onClose={() => {
          setShowCategoriaForm(false);
          setEditingCategoria(null);
        }}
      >
        <CategoriaForm
          initial={editingCategoria}
          onCancel={() => {
            setShowCategoriaForm(false);
            setEditingCategoria(null);
          }}
          onSubmit={async (data) => {
            if (editingCategoria) {
              await handleUpdateCategoria(data);
            } else {
              await handleCreateCategoria(data);
              setShowCategoriaForm(false);
            }
          }}
        />
      </Modal>

      <ConfirmDialog
        open={confirmDeleteCategoriaId !== null}
        title="Eliminar categoría"
        description={`¿Eliminar la categoría ${
          categorias.find((c) => c.id === confirmDeleteCategoriaId)?.nombre ?? ""
        }? Solo se permite si no tiene artículos asignados.`}
        confirmLabel="Eliminar"
        danger
        busy={categoriaDeleteBusy}
        onConfirm={confirmDeleteCategoria}
        onCancel={() => setConfirmDeleteCategoriaId(null)}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Eliminar artículo"
        description={`¿Eliminar definitivamente ${
          activos.find((a) => a.id === confirmDeleteId)?.numero_patrimonial ?? "este artículo"
        }? Se borrarán sus etiquetas, fotos e historial. Después podrás volver a crearlo con el mismo número patrimonial.`}
        confirmLabel="Eliminar"
        danger
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <ConfirmDialog
        open={pendingEtiquetas !== null}
        title="Generar etiquetas"
        description={`El artículo ${
          pendingEtiquetas?.numero_patrimonial ?? ""
        } ya está creado. ¿Querés generar etiquetas RFID ahora?`}
        confirmLabel="Imprimir etiquetas"
        cancelLabel="Ahora no"
        onConfirm={() => {
          if (pendingEtiquetas) {
            const id = pendingEtiquetas.id;
            setPendingEtiquetas(null);
            openEtiquetasModal(id);
          }
        }}
        onCancel={() => setPendingEtiquetas(null)}
      />

      <ImprimirEtiquetasModal
        open={showEtiquetasModal}
        onClose={() => {
          setShowEtiquetasModal(false);
          setEtiquetasActivoId(null);
        }}
        activos={activos}
        initialActivoId={etiquetasActivoId}
        onPrinted={() => void loadData()}
      />
    </div>
  );
}
