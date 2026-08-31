import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type { Activo, ActivoCreatePayload, Categoria, CategoriaCreatePayload } from "../types";
import ActivoForm from "./ActivoForm";
import ActivosList from "./ActivosList";
import CategoriaForm from "./CategoriaForm";

export default function ActivosPage() {
  const [activos, setActivos] = useState<Activo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"activos" | "categorias">("activos");

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

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
            <ActivosList activos={activos} loading={loading} />
          </section>

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
