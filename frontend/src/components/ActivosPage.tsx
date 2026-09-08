import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
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
import PageHeader from "./PageHeader";

async function fetchUbicacionOrNull(activoId: string): Promise<UbicacionAsignada | null> {
  try {
    return await apiFetch<UbicacionAsignada>(`/activos/${activoId}/ubicacion`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export default function ActivosPage() {
  const [activos, setActivos] = useState<Activo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Record<string, UbicacionAsignada | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historialId, setHistorialId] = useState<string | null>(null);
  const [fotosId, setFotosId] = useState<string | null>(null);
  const [historial, setHistorial] = useState<HistorialEntry[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [tab, setTab] = useState<"activos" | "categorias">("activos");

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
    const activo = activos.find((a) => a.id === activoId);
    const label = activo?.numero_patrimonial ?? "este activo";
    if (!window.confirm(`¿Dar de baja ${label}? Dejará de aparecer en el listado.`)) {
      return;
    }
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
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al dar de baja el activo");
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
        <div className="tabs">
          <button
            type="button"
            className={`tab ${tab === "activos" ? "active" : ""}`}
            onClick={() => setTab("activos")}
          >
            Activos
          </button>
          <button
            type="button"
            className={`tab ${tab === "categorias" ? "active" : ""}`}
            onClick={() => setTab("categorias")}
          >
            Categorías
          </button>
        </div>
      </PageHeader>

      {error && <p className="error">{error}</p>}
      {actionError && <p className="error">{actionError}</p>}

      {tab === "activos" && (
        <>
          <section className="card">
            <div className="section-header">
              <h3>Listado</h3>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  closePanels();
                  setShowForm((v) => !v);
                }}
              >
                {showForm ? "Ocultar" : "+ Nuevo"}
              </button>
            </div>
            <ActivosList
              activos={activos}
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
            />
          </section>

          {assigningActivo && (
            <section className="card">
              <h3>
                Asignar ubicación — {assigningActivo.numero_patrimonial}
              </h3>
              <p className="muted">
                {assigningActivo.descripcion}
                {ubicaciones[assigningActivo.id]
                  ? ` · Actual: ${ubicaciones[assigningActivo.id]!.deposito_nombre} / ${ubicaciones[assigningActivo.id]!.sector_nombre} / ${ubicaciones[assigningActivo.id]!.ubicacion_codigo}`
                  : " · Sin ubicación"}
              </p>
              <AsignacionUbicacionForm
                onSubmit={handleAssign}
                onCancel={() => setAssigningId(null)}
                submitLabel={ubicaciones[assigningActivo.id] ? "Cambiar ubicación" : "Asignar ubicación"}
              />
            </section>
          )}

          {editingActivo && (
            <section className="card">
              <h3>Editar activo — {editingActivo.numero_patrimonial}</h3>
              <ActivoForm
                key={editingActivo.id}
                categorias={categorias}
                initial={editingActivo}
                onSubmit={handleUpdateActivo}
                onCancel={() => setEditingId(null)}
                submitLabel="Guardar cambios"
              />
            </section>
          )}

          {fotosActivo && (
            <section className="card">
              <h3>Fotografías — {fotosActivo.numero_patrimonial}</h3>
              <p className="muted">{fotosActivo.descripcion}</p>
              <ActivoFotos key={fotosActivo.id} activoId={fotosActivo.id} />
              <div className="form-actions">
                <button type="button" className="btn secondary" onClick={() => setFotosId(null)}>
                  Cerrar
                </button>
              </div>
            </section>
          )}

          {historialActivo && (
            <section className="card">
              <h3>Historial — {historialActivo.numero_patrimonial}</h3>
              <p className="muted">{historialActivo.descripcion}</p>
              <ActivoHistorial entries={historial} loading={historialLoading} />
              <div className="form-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setHistorialId(null);
                    setHistorial([]);
                  }}
                >
                  Cerrar
                </button>
              </div>
            </section>
          )}

          {showForm && (
            <section className="card">
              <h3>Alta de activo</h3>
              <ActivoForm
                categorias={categorias}
                onSubmit={handleCreateActivo}
                onCancel={() => setShowForm(false)}
              />
            </section>
          )}
        </>
      )}

      {tab === "categorias" && (
        <section className="card">
          <h3>Nueva categoría</h3>
          <CategoriaForm onSubmit={handleCreateCategoria} />
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
        </section>
      )}
    </div>
  );
}
