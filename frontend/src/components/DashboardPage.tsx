import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type { DashboardResumen, MovimientoItem, MovimientosPage } from "../types";

const ACCION_LABELS: Record<string, string> = {
  creacion: "Alta",
  actualizacion: "Actualización",
  desactivacion: "Baja",
  asignacion_ubicacion: "Asignación",
  desasignacion_ubicacion: "Desasignación",
  etiqueta_impresa: "Etiqueta",
  foto_agregada: "Foto+",
  foto_eliminada: "Foto−",
  transferencia: "Transferencia",
};

function formatAccion(accion: string): string {
  return ACCION_LABELS[accion] ?? accion.replace(/_/g, " ");
}

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR");
  } catch {
    return iso;
  }
}

function MovimientoRow({ item }: { item: MovimientoItem }) {
  return (
    <li className="historial-item">
      <div className="historial-head">
        <strong>
          {formatAccion(item.accion)}
          {item.numero_patrimonial ? ` · ${item.numero_patrimonial}` : ""}
        </strong>
        <span className="muted">{formatFecha(item.creado_en)}</span>
      </div>
      <p className="muted historial-user">
        {item.descripcion ?? "—"} · {item.usuario_nombre ?? "Sistema"}
      </p>
    </li>
  );
}

export default function DashboardPage() {
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientosPage | null>(null);
  const [accion, setAccion] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllMovimientos, setShowAllMovimientos] = useState(false);

  const loadResumen = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<DashboardResumen>("/dashboard/resumen");
      setResumen(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResumen();
  }, [loadResumen]);

  const loadMovimientos = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (accion) params.set("accion", accion);
      if (search.trim()) params.set("search", search.trim());
      const data = await apiFetch<MovimientosPage>(`/movimientos?${params.toString()}`);
      setMovimientos(data);
      setShowAllMovimientos(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar movimientos");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Cargando dashboard...</p>
      </div>
    );
  }

  if (!resumen) {
    return (
      <div className="page">
        {error && <p className="error">{error}</p>}
        <button type="button" className="btn primary" onClick={loadResumen}>
          Reintentar
        </button>
      </div>
    );
  }

  const { kpis } = resumen;
  const disc = kpis.discrepancias_inventarios_cerrados;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Dashboard</h2>
        <button type="button" className="btn secondary" onClick={loadResumen}>
          Actualizar
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="kpi-grid" aria-label="Indicadores">
        <div className="kpi-card">
          <span className="kpi-label">Activos</span>
          <strong className="kpi-value">{kpis.activos_activos}</strong>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Stock ubicado</span>
          <strong className="kpi-value">{kpis.stock_total_ubicado}</strong>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Depósitos</span>
          <strong className="kpi-value">{kpis.depositos_activos}</strong>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Inventarios abiertos</span>
          <strong className="kpi-value">{kpis.inventarios_abiertos}</strong>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Transferencias abiertas</span>
          <strong className="kpi-value">{kpis.transferencias_abiertas}</strong>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Discrepancias</span>
          <strong className="kpi-value">{disc.inventarios_con_discrepancia}</strong>
          <span className="muted kpi-sub">
            {disc.faltantes} falt. · {disc.sobrantes} sobr.
          </span>
        </div>
      </section>

      <div className="two-col dash-cols">
        <section className="card">
          <h3>Stock por depósito</h3>
          {resumen.stock_por_deposito.length === 0 ? (
            <p className="muted">Sin depósitos activos.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Depósito</th>
                    <th>Activos</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.stock_por_deposito.map((s) => (
                    <tr key={s.deposito_id}>
                      <td>{s.deposito_nombre}</td>
                      <td>{s.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h3>Movimientos recientes</h3>
          {resumen.movimientos_recientes.length === 0 ? (
            <p className="muted">Sin movimientos aún.</p>
          ) : (
            <ol className="historial-list compact-list" aria-label="Movimientos recientes">
              {resumen.movimientos_recientes.map((m) => (
                <MovimientoRow key={m.id} item={m} />
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="two-col dash-cols">
        <section className="card">
          <h3>Transferencias recientes</h3>
          {resumen.transferencias_recientes.length === 0 ? (
            <p className="muted">Sin transferencias.</p>
          ) : (
            <ul className="simple-list">
              {resumen.transferencias_recientes.map((t) => (
                <li key={t.id}>
                  <strong>{t.estado}</strong>
                  <span className="muted">
                    {" "}
                    · {t.deposito_origen_nombre ?? "?"} → {t.deposito_destino_nombre ?? "?"}
                    {" · "}
                    {t.confirmados_destino}/{t.total_activos}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>Inventarios recientes</h3>
          {resumen.inventarios_recientes.length === 0 ? (
            <p className="muted">Sin inventarios.</p>
          ) : (
            <ul className="simple-list">
              {resumen.inventarios_recientes.map((inv) => (
                <li key={inv.id}>
                  <strong>{inv.estado}</strong>
                  <span className="muted">
                    {" "}
                    · {inv.deposito_nombre ?? "?"} · esp {inv.total_esperado} · falt{" "}
                    {inv.total_faltante} · sobr {inv.total_sobrante}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h3>Historial de movimientos</h3>
        <form className="form inline-form" onSubmit={loadMovimientos} aria-label="Filtrar movimientos">
          <label className="field">
            <span>Acción</span>
            <select value={accion} onChange={(e) => setAccion(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ACCION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Buscar</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Patrimonial o descripción"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </form>

        {showAllMovimientos && movimientos && (
          <>
            <p className="muted">
              {movimientos.total} resultado{movimientos.total === 1 ? "" : "s"}
            </p>
            {movimientos.items.length === 0 ? (
              <p className="muted">No hay movimientos con esos filtros.</p>
            ) : (
              <ol className="historial-list" aria-label="Resultados de movimientos">
                {movimientos.items.map((m) => (
                  <MovimientoRow key={m.id} item={m} />
                ))}
              </ol>
            )}
          </>
        )}
      </section>
    </div>
  );
}
