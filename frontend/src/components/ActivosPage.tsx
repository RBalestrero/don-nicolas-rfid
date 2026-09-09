import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { useToast } from "../context/ToastContext";
import type {
  Activo,
  ActivoCreatePayload,
  AsignacionUbicacionPayload,
  Categoria,
  CategoriaCreatePayload,
  HistorialEntry,
  UbicacionAsignada,
} from "../types";
import ActivoForm from "./ActivoForm";
import ActivoFotos from "./ActivoFotos";
import ActivoHistorial from "./ActivoHistorial";
import ActivosList from "./ActivosList";
import AsignacionUbicacionForm from "./AsignacionUbicacionForm";
import CategoriaForm from "./CategoriaForm";
import ConfirmDialog from "./ConfirmDialog";
import EmptyState from "./EmptyState";
import Modal from "./Modal";
import PageHeader from "./PageHeader";
import {
  filterActivos,
  hasActiveActivosFilters,
  type UbicacionFilter,
} from "../lib/filterActivos";
import { usePermissions } from "../lib/usePermissions";

async function fetchUbicacionOrNull(activoId: string): Promise<UbicacionAsignada | null> {
  try {
    return await apiFetch<UbicacionAsignada>(`/activos/${activoId}/ubicacion`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export default function ActivosPage() {
  const toast = useToast();
  const perms = usePermissions();
  const [activos, setActivos] = useState<Activo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Record<string, UbicacionAsignada | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCategoriaForm, setShowCategoriaForm] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historialId, setHistorialId] = useState<string | null>(null);
  const [fotosId, setFotosId] = useState<string | null>(null);
  const [historial, setHistorial] = useState<HistorialEntry[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [tab, setTab] = useState<"activos" | "categorias">("activos");
  const [confirmBajaId, setConfirmBajaId] = useState<string | null>(null);
  const [bajaBusy, setBajaBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [ubicacionFilter, setUbicacionFilter] = useState<UbicacionFilter>("all");

  useEffect(() => {
    const flag = sessionStorage.getItem("dn_act_filter");
    if (flag === "sin") {
      setUbicacionFilter("sin");
      sessionStorage.removeItem("dn_act_filter");
    }
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
  };

  const loadUbicaciones = useCallback(async (lista: Activo[]) => {
    const entries = await Promise.all(
      lista.map(async (activo) => {
        const ubicacion = await fetchUbicacionOrNull(activo.id);
        return [activo.id, ubicacion] as const;
      }),
    );
    setUbicaciones(Object.fromEntries(entries));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activosData, categoriasData] = await Promise.all([
        apiFetch<Activo[]>("/activos"),
        apiFetch<Categoria[]>("/categorias"),
      ]);
      setActivos(activosData);
      setCategorias(categoriasData);
      await loadUbicaciones(activosData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [loadUbicaciones]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const closePanels = () => {
    setAssigningId(null);
    setEditingId(null);
    setHistorialId(null);
    setFotosId(null);
    setHistorial([]);
  };

  const handleCreateActivo = async (data: ActivoCreatePayload) => {
    await apiFetch<Activo>("/activos", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setShowForm(false);
    toast.success("Activo creado");
    await loadData();
  };

  const handleUpdateActivo = async (data: ActivoCreatePayload) => {
    if (!editingId) return;
    setActionError(null);
    try {
      await apiFetch<Activo>(`/activos/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      setEditingId(null);
      toast.success("Activo actualizado");
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al actualizar el activo");
      throw err;
    }
  };

  const handleCreateCategoria = async (data: CategoriaCreatePayload) => {
    await apiFetch<Categoria>("/categorias", {
      method: "POST",
      body: JSON.stringify(data),
    });
    toast.success("Categoría creada");
    await loadData();
  };

  const handleToggleAssign = (activoId: string) => {
    setActionError(null);
    setShowForm(false);
    setEditingId(null);
    setHistorialId(null);
    setFotosId(null);
    setHistorial([]);
    setAssigningId((current) => (current === activoId ? null : activoId));
  };

  const handleToggleEdit = (activoId: string) => {
    setActionError(null);
    setShowForm(false);
    setAssigningId(null);
    setHistorialId(null);
    setFotosId(null);
    setHistorial([]);
    setEditingId((current) => (current === activoId ? null : activoId));
  };

  const handleToggleFotos = (activoId: string) => {
    setActionError(null);
    setShowForm(false);
    setAssigningId(null);
    setEditingId(null);
    setHistorialId(null);
    setHistorial([]);
    setFotosId((current) => (current === activoId ? null : activoId));
  };

  const handleToggleHistorial = async (activoId: string) => {
    setActionError(null);
    setShowForm(false);
    setAssigningId(null);
    setEditingId(null);
    setFotosId(null);

    if (historialId === activoId) {
      setHistorialId(null);
      setHistorial([]);
      return;
    }

    setHistorialId(activoId);
    setHistorialLoading(true);
    try {
      const data = await apiFetch<HistorialEntry[]>(`/activos/${activoId}/historial`);
      setHistorial(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al cargar historial");
      setHistorialId(null);
      setHistorial([]);
    } finally {
      setHistorialLoading(false);
    }
  };

  const handleDeactivate = async (activoId: string) => {
    setConfirmBajaId(activoId);
  };

  const confirmDeactivate = async () => {
    if (!confirmBajaId) return;
    const activoId = confirmBajaId;
    const activo = activos.find((a) => a.id === activoId);
    const label = activo?.numero_patrimonial ?? "este activo";
    setBajaBusy(true);
    setActionError(null);
    try {
      await apiFetch<void>(`/activos/${activoId}`, { method: "DELETE" });
      if (
        assigningId === activoId ||
        editingId === activoId ||
        historialId === activoId ||
        fotosId === activoId
      ) {
        closePanels();
      }
      setConfirmBajaId(null);
      toast.success(`${label} dado de baja`);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al dar de baja el activo");
    } finally {
      setBajaBusy(false);
    }
  };

  const handleAssign = async (data: AsignacionUbicacionPayload) => {
    if (!assigningId) return;
    setActionError(null);
    try {
      const assigned = await apiFetch<UbicacionAsignada>(
        `/activos/${assigningId}/asignar-ubicacion`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      setUbicaciones((prev) => ({ ...prev, [assigningId]: assigned }));
      setAssigningId(null);
      toast.success("Ubicación asignada");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al asignar ubicación");
      throw err;
    }
  };

  const handleUnassign = async (activoId: string) => {
    setActionError(null);
    try {
      await apiFetch<void>(`/activos/${activoId}/ubicacion`, { method: "DELETE" });
      setUbicaciones((prev) => ({ ...prev, [activoId]: null }));
      if (assigningId === activoId) setAssigningId(null);
      toast.success("Ubicación quitada");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al quitar ubicación");
    }
  };

  const assigningActivo = activos.find((a) => a.id === assigningId) ?? null;
  const editingActivo = activos.find((a) => a.id === editingId) ?? null;
  const historialActivo = activos.find((a) => a.id === historialId) ?? null;
  const fotosActivo = activos.find((a) => a.id === fotosId) ?? null;

  return (
    <div className="page">
      <PageHeader
        title="Activos"
        subtitle="Alta, ubicación, fotos e historial patrimonial"
      >
        <div className="tabs" role="tablist" aria-label="Sección de activos">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "activos"}
            className={`tab ${tab === "activos" ? "active" : ""}`}
            onClick={() => setTab("activos")}
          >
            Activos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "categorias"}
            className={`tab ${tab === "categorias" ? "active" : ""}`}
            onClick={() => setTab("categorias")}
          >
            Categorías
          </button>
        </div>
      </PageHeader>

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

      {tab === "activos" && (
        <>
          <Modal
            open={showForm && perms.canWriteAssets}
            title="Alta de activo"
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
            title={editingActivo ? `Editar — ${editingActivo.numero_patrimonial}` : "Editar activo"}
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

          <Modal
            open={Boolean(assigningActivo && perms.canWriteAssignment)}
            title={
              assigningActivo
                ? `Ubicación — ${assigningActivo.numero_patrimonial}`
                : "Asignar ubicación"
            }
            subtitle={
              assigningActivo
                ? `${assigningActivo.descripcion}${
                    ubicaciones[assigningActivo.id]
                      ? ` · Actual: ${ubicaciones[assigningActivo.id]!.deposito_nombre} / ${ubicaciones[assigningActivo.id]!.sector_nombre} / ${ubicaciones[assigningActivo.id]!.ubicacion_codigo}`
                      : " · Sin ubicación"
                  }`
                : undefined
            }
            size="md"
            onClose={() => setAssigningId(null)}
          >
            <AsignacionUbicacionForm
              onSubmit={handleAssign}
              onCancel={() => setAssigningId(null)}
              submitLabel={
                assigningActivo && ubicaciones[assigningActivo.id]
                  ? "Cambiar ubicación"
                  : "Asignar ubicación"
              }
            />
          </Modal>

          <Modal
            open={Boolean(fotosActivo)}
            title={fotosActivo ? `Fotos — ${fotosActivo.numero_patrimonial}` : "Fotos"}
            subtitle={fotosActivo?.descripcion}
            size="lg"
            onClose={() => setFotosId(null)}
          >
            {fotosActivo && (
              <ActivoFotos
                key={fotosActivo.id}
                activoId={fotosActivo.id}
                canWrite={perms.canWriteAssets}
              />
            )}
          </Modal>

          <Modal
            open={Boolean(historialActivo)}
            title={
              historialActivo ? `Historial — ${historialActivo.numero_patrimonial}` : "Historial"
            }
            subtitle={historialActivo?.descripcion}
            size="lg"
            onClose={() => {
              setHistorialId(null);
              setHistorial([]);
            }}
          >
            <ActivoHistorial entries={historial} loading={historialLoading} />
          </Modal>

          <section className="card">
            <div className="section-header">
              <h3>Listado</h3>
              <div className="section-header-right">
                {!loading && activos.length > 0 && (
                  <span className="muted">
                    {activosFiltrados.length}
                    {filtersActive ? ` / ${activos.length}` : ""} activos
                  </span>
                )}
                {perms.canWriteAssets && (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      closePanels();
                      setShowForm(true);
                    }}
                  >
                    + Nuevo activo
                  </button>
                )}
              </div>
            </div>

            {activos.length > 0 && (
              <div className="toolbar" role="search" aria-label="Filtrar activos">
                <label className="field toolbar-field grow">
                  <span>Buscar</span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Patrimonial, EPC, descripción o ubicación"
                  />
                </label>
                <label className="field toolbar-field">
                  <span>Categoría</span>
                  <select
                    value={categoriaFilter}
                    onChange={(e) => setCategoriaFilter(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field toolbar-field">
                  <span>Ubicación</span>
                  <select
                    value={ubicacionFilter}
                    onChange={(e) => setUbicacionFilter(e.target.value as UbicacionFilter)}
                  >
                    <option value="all">Todas</option>
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
                description="Ningún activo coincide con los filtros actuales."
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
                assigningId={assigningId}
                editingId={editingId}
                historialId={historialId}
                fotosId={fotosId}
                onAssign={handleToggleAssign}
                onUnassign={handleUnassign}
                onEdit={handleToggleEdit}
                onHistorial={handleToggleHistorial}
                onFotos={handleToggleFotos}
                onDeactivate={handleDeactivate}
                canWriteAssets={perms.canWriteAssets}
                canWriteAssignment={perms.canWriteAssignment}
                onCreateRequest={
                  perms.canWriteAssets
                    ? () => {
                        closePanels();
                        setShowForm(true);
                      }
                    : undefined
                }
              />
            )}
          </section>
        </>
      )}

      {tab === "categorias" && (
        <section className="card">
          <div className="section-header">
            <h3>Categorías</h3>
            {perms.canWriteAssets && (
              <button
                type="button"
                className="btn primary"
                onClick={() => setShowCategoriaForm(true)}
              >
                + Nueva categoría
              </button>
            )}
          </div>
          {!perms.canWriteAssets && (
            <p className="muted">Solo lectura — tu rol no puede crear categorías.</p>
          )}
          {!loading && categorias.length > 0 && (
            <ul className="simple-list">
              {categorias.map((c) => (
                <li key={c.id}>
                  <strong>{c.nombre}</strong>
                  {c.descripcion && <span className="muted"> — {c.descripcion}</span>}
                </li>
              ))}
            </ul>
          )}
          {!loading && categorias.length === 0 && (
            <p className="muted">Todavía no hay categorías.</p>
          )}
        </section>
      )}

      <Modal
        open={showCategoriaForm && perms.canWriteAssets}
        title="Nueva categoría"
        size="sm"
        onClose={() => setShowCategoriaForm(false)}
      >
        <CategoriaForm
          onSubmit={async (data) => {
            await handleCreateCategoria(data);
            setShowCategoriaForm(false);
          }}
        />
      </Modal>

      <ConfirmDialog
        open={confirmBajaId !== null}
        title="Dar de baja activo"
        description={`¿Confirmás la baja de ${
          activos.find((a) => a.id === confirmBajaId)?.numero_patrimonial ?? "este activo"
        }? Dejará de aparecer en el listado operativo.`}
        confirmLabel="Dar de baja"
        danger
        busy={bajaBusy}
        onConfirm={confirmDeactivate}
        onCancel={() => setConfirmBajaId(null)}
      />
    </div>
  );
}
