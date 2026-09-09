import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../context/ToastContext";
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
import EmptyState from "./EmptyState";
import SectorForm from "./SectorForm";
import UbicacionForm from "./UbicacionForm";
import { usePermissions } from "../lib/usePermissions";

export default function DepositosPage() {
  const toast = useToast();
  const perms = usePermissions();
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DepositoDetalle | null>(null);
  const [stock, setStock] = useState<StockDeposito | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"estructura" | "stock">("estructura");
  const [stockSearch, setStockSearch] = useState("");

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
      setStockSearch("");
    } else {
      setDetalle(null);
      setStock(null);
    }
  }, [selectedId, loadDetalle]);

  const stockFiltrado = useMemo(() => {
    if (!stock) return [];
    const q = stockSearch.trim().toLowerCase();
    if (!q) return stock.activos;
    return stock.activos.filter((a) =>
      [
        a.numero_patrimonial,
        a.descripcion,
        a.categoria_nombre,
        a.sector_nombre,
        a.ubicacion_codigo,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [stock, stockSearch]);

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

  const handleCreateSector = async (data: SectorCreatePayload) => {
    if (!selectedId) return;
    await apiFetch(`/depositos/${selectedId}/sectores`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    toast.success("Sector creado");
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
    toast.success("Ubicación creada");
    await loadDetalle(selectedId);
  };

  return (
    <div className="page">
      <PageHeader
        title="Depósitos"
        subtitle="Estructura depósito → sector → ubicación y stock"
      >
        {perms.canWriteWarehouse && (
          <button
            type="button"
            className="btn primary"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancelar" : "+ Nuevo depósito"}
          </button>
        )}
      </PageHeader>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {showForm && perms.canWriteWarehouse && (
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
                <button type="button" className="btn primary btn-sm" onClick={() => setShowForm(true)}>
                  + Nuevo depósito
                </button>
              ) : undefined
            }
          />
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
                <div className="section-header">
                  <div>
                    <span className="section-kicker">Estructura</span>
                    <h3>{detalle.nombre}</h3>
                  </div>
                  <span className="muted">
                    {detalle.sectores.length} sector
                    {detalle.sectores.length === 1 ? "" : "es"} ·{" "}
                    {detalle.sectores.reduce((n, s) => n + s.ubicaciones.length, 0)} ubicaciones
                  </span>
                </div>
                {detalle.direccion && <p className="muted">{detalle.direccion}</p>}
                {detalle.descripcion && <p className="muted">{detalle.descripcion}</p>}

                {detalle.sectores.length === 0 ? (
                  <p className="muted">
                    Sin sectores.
                    {perms.canWriteWarehouse ? " Creá uno abajo." : ""}
                  </p>
                ) : (
                  <div className="tree">
                    {detalle.sectores.map((sector) => (
                      <div key={sector.id} className="tree-sector">
                        <div className="tree-sector-head">
                          <strong>{sector.nombre}</strong>
                          <span className="muted">
                            {sector.ubicaciones.length} ubic.
                          </span>
                        </div>
                        {sector.descripcion && (
                          <p className="muted tree-sector-desc">{sector.descripcion}</p>
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

              {perms.canWriteWarehouse && (
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
              )}
            </>
          )}

          {tab === "stock" && (
            <section className="card">
              <div className="section-header">
                <h3>Stock en {detalle.nombre}</h3>
                <div className="section-header-right">
                  {stock && stock.total > 0 && (
                    <span className="muted">
                      {stockFiltrado.length}
                      {stockSearch.trim() ? ` / ${stock.total}` : ""} activos
                    </span>
                  )}
                  <ExportButtons
                    basePath={`/reportes/stock/${detalle.id}`}
                    filenameBase={`stock_${detalle.nombre}`}
                    disabled={!stock || stock.total === 0}
                  />
                </div>
              </div>
              {!stock || stock.total === 0 ? (
                <p className="muted">No hay activos asignados en este depósito.</p>
              ) : (
                <>
                  <div className="toolbar" role="search" aria-label="Filtrar stock">
                    <label className="field toolbar-field grow">
                      <span>Buscar en stock</span>
                      <input
                        value={stockSearch}
                        onChange={(e) => setStockSearch(e.target.value)}
                        placeholder="Patrimonial, categoría, sector o ubicación"
                      />
                    </label>
                    {stockSearch.trim() && (
                      <div className="toolbar-actions">
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => setStockSearch("")}
                        >
                          Limpiar
                        </button>
                      </div>
                    )}
                  </div>
                  {stockFiltrado.length === 0 ? (
                    <EmptyState
                      title="Sin coincidencias"
                      description="Ningún activo del stock coincide con la búsqueda."
                      action={
                        <button
                          type="button"
                          className="btn secondary btn-sm"
                          onClick={() => setStockSearch("")}
                        >
                          Limpiar búsqueda
                        </button>
                      }
                    />
                  ) : (
                    <div className="table-wrap table-panel">
                      <table className="data-table dense sticky-head">
                        <thead>
                          <tr>
                            <th>Patrimonio</th>
                            <th className="col-hide-sm">Descripción</th>
                            <th>Categoría</th>
                            <th>Sector</th>
                            <th>Ubicación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockFiltrado.map((a) => (
                            <tr key={a.activo_id}>
                              <td className="mono">{a.numero_patrimonial}</td>
                              <td className="col-hide-sm">{a.descripcion}</td>
                              <td>{a.categoria_nombre}</td>
                              <td>{a.sector_nombre}</td>
                              <td className="mono">{a.ubicacion_codigo}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
