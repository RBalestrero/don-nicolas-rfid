import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import type {
  Activo,
  ActivoCreatePayload,
  AsignacionUbicacionPayload,
  Categoria,
  CategoriaCreatePayload,
  UbicacionAsignada,
} from "../types";
import ActivoForm from "./ActivoForm";
import ActivosList from "./ActivosList";
import AsignacionUbicacionForm from "./AsignacionUbicacionForm";
import CategoriaForm from "./CategoriaForm";

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

  const handleCreateActivo = async (data: ActivoCreatePayload) => {
    await apiFetch<Activo>("/activos", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setShowForm(false);
    await loadData();
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
    setAssigningId((current) => (current === activoId ? null : activoId));
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

  return (
    <div className="page">
      <div className="page-header">
        <h2>Gestión de activos</h2>
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
      </div>

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
                onClick={() => setShowForm((v) => !v)}
              >
                {showForm ? "Ocultar formulario" : "+ Nuevo activo"}
              </button>
            </div>
            <ActivosList
              activos={activos}
              ubicaciones={ubicaciones}
              loading={loading}
              assigningId={assigningId}
              onAssign={handleToggleAssign}
              onUnassign={handleUnassign}
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
