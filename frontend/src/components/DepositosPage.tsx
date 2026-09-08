import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type {
  Deposito,
  DepositoCreatePayload,
  DepositoDetalle,
  SectorCreatePayload,
  StockDeposito,
  UbicacionCreatePayload,
} from "../types";
import DepositoForm from "./DepositoForm";
import PageHeader from "./PageHeader";
import ExportButtons from "./ExportButtons";
import SectorForm from "./SectorForm";
import UbicacionForm from "./UbicacionForm";

export default function DepositosPage() {
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DepositoDetalle | null>(null);
  const [stock, setStock] = useState<StockDeposito | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"estructura" | "stock">("estructura");

  const loadDepositos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Deposito[]>("/depositos");
      setDepositos(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar depósitos");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetalle = useCallback(async (depositoId: string) => {
    try {
      const [tree, stockData] = await Promise.all([
        apiFetch<DepositoDetalle>(`/depositos/${depositoId}?include_tree=true`),
        apiFetch<StockDeposito>(`/depositos/${depositoId}/stock`),
      ]);
      setDetalle(tree);
      setStock(stockData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar detalle");
      setDetalle(null);
      setStock(null);
    }
  }, []);

  useEffect(() => {
    loadDepositos().then((data) => {
      if (data.length > 0) {
        setSelectedId((current) => current ?? data[0].id);
      }
    });
  }, [loadDepositos]);

  useEffect(() => {
    if (selectedId) {
      loadDetalle(selectedId);
    } else {
      setDetalle(null);
      setStock(null);
    }
  }, [selectedId, loadDetalle]);

  const handleCreateDeposito = async (data: DepositoCreatePayload) => {
    const created = await apiFetch<Deposito>("/depositos", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setShowForm(false);
    setSelectedId(created.id);
    await loadDepositos();
  };

  const handleCreateSector = async (data: SectorCreatePayload) => {
    if (!selectedId) return;
    await apiFetch(`/depositos/${selectedId}/sectores`, {
      method: "POST",
      body: JSON.stringify(data),
    });
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
    await loadDetalle(selectedId);
  };

  return (
    <div className="page">
      <PageHeader
        title="Depósitos"
        subtitle="Estructura depósito → sector → ubicación y stock"
      >
        <button
          type="button"
          className="btn primary"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancelar" : "+ Nuevo depósito"}
        </button>
      </PageHeader>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <section className="card panel-focus">
          <h3>Alta de depósito</h3>
          <DepositoForm
            onSubmit={handleCreateDeposito}
            onCancel={() => setShowForm(false)}
          />
        </section>
      )}

      <section className="card">
        <div className="section-header">
          <h3>Seleccionar depósito</h3>
        </div>
        {loading && <p className="muted">Cargando depósitos...</p>}
        {!loading && depositos.length === 0 && (
          <div className="empty-state-block" role="status">
            <p className="empty-state-title">Sin depósitos</p>
            <p className="empty-state">Creá el primero para armar sectores y ubicaciones.</p>
            <div className="empty-state-action">
              <button type="button" className="btn primary btn-sm" onClick={() => setShowForm(true)}>
                + Nuevo depósito
              </button>
            </div>
          </div>
        )}
        {!loading && depositos.length > 0 && (
          <div className="deposito-selector" role="listbox" aria-label="Lista de depósitos">
            {depositos.map((d) => (
              <button
                key={d.id}
                type="button"
                role="option"
                aria-selected={selectedId === d.id}
                className={`deposito-chip ${selectedId === d.id ? "active" : ""}`}
                onClick={() => setSelectedId(d.id)}
              >
                {d.nombre}
              </button>
            ))}
          </div>
        )}
      </section>

      {detalle && (
        <>
          <div className="tabs" role="tablist" aria-label="Vista del depósito">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "estructura"}
              className={`tab ${tab === "estructura" ? "active" : ""}`}
              onClick={() => setTab("estructura")}
            >
              Estructura
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "stock"}
              className={`tab ${tab === "stock" ? "active" : ""}`}
              onClick={() => setTab("stock")}
            >
              Stock ({stock?.total ?? 0})
            </button>
          </div>

          {tab === "estructura" && (
            <>
              <section className="card">
                <h3>{detalle.nombre}</h3>
                {detalle.direccion && <p className="muted">{detalle.direccion}</p>}
                {detalle.descripcion && (
                  <p className="muted" style={{ marginBottom: "1rem" }}>
                    {detalle.descripcion}
                  </p>
                )}

                {detalle.sectores.length === 0 ? (
                  <p className="muted">Sin sectores. Creá uno abajo.</p>
                ) : (
                  <div className="tree">
                    {detalle.sectores.map((sector) => (
                      <div key={sector.id} className="tree-sector">
                        <strong>{sector.nombre}</strong>
                        {sector.descripcion && (
                          <span className="muted"> — {sector.descripcion}</span>
                        )}
                        {sector.ubicaciones.length === 0 ? (
                          <p className="muted tree-empty">Sin ubicaciones</p>
                        ) : (
                          <ul className="tree-ubicaciones">
                            {sector.ubicaciones.map((u) => (
                              <li key={u.id}>
                                <code>{u.codigo}</code>
                                {u.descripcion && (
                                  <span className="muted"> — {u.descripcion}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className="two-col">
                <section className="card">
                  <h3>Nuevo sector</h3>
                  <SectorForm onSubmit={handleCreateSector} />
                </section>
                <section className="card">
                  <h3>Nueva ubicación</h3>
                  <UbicacionForm
                    sectores={detalle.sectores}
                    onSubmit={handleCreateUbicacion}
                  />
                </section>
              </div>
            </>
          )}

          {tab === "stock" && (
            <section className="card">
              <div className="section-header">
                <h3>Stock en {detalle.nombre}</h3>
                <ExportButtons
                  basePath={`/reportes/stock/${detalle.id}`}
                  filenameBase={`stock_${detalle.nombre}`}
                  disabled={!stock || stock.total === 0}
                />
              </div>
              {!stock || stock.total === 0 ? (
                <p className="muted">No hay activos asignados en este depósito.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Patrimonio</th>
                        <th>Descripción</th>
                        <th>Categoría</th>
                        <th>Sector</th>
                        <th>Ubicación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stock.activos.map((a) => (
                        <tr key={a.activo_id}>
                          <td>{a.numero_patrimonial}</td>
                          <td>{a.descripcion}</td>
                          <td>{a.categoria_nombre}</td>
                          <td>{a.sector_nombre}</td>
                          <td className="mono">{a.ubicacion_codigo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
