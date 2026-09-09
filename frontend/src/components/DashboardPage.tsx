import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import type {
  DashboardResumen,
  InventarioResumenDash,
  MovimientoItem,
  MovimientosPage,
  TransferenciaResumenDash,
} from "../types";
import PageHeader from "./PageHeader";
import ExportButtons from "./ExportButtons";
import EmptyState from "./EmptyState";
import { usePermissions } from "../lib/usePermissions";

export type AppPage =
  | "dashboard"
  | "activos"
  | "depositos"
  | "inventarios"
  | "transferencias";

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
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function estadoXfer(estado: string): string {
  switch (estado) {
    case "pendiente":
      return "Pendiente";
    case "en_transito":
      return "En tránsito";
    case "completada":
      return "Completada";
    case "cancelada":
      return "Cancelada";
    default:
      return estado;
  }
}

interface DashboardPageProps {
  onNavigate?: (page: AppPage) => void;
}

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const perms = usePermissions();
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [filtrados, setFiltrados] = useState<MovimientosPage | null>(null);
  const [accion, setAccion] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadResumen = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<DashboardResumen>("/dashboard/resumen?movimientos_limit=15&ops_limit=8");
      setResumen(data);
      setFiltrados(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResumen();
  }, [loadResumen]);

  const colaTransferencias = useMemo(
    () =>
      (resumen?.transferencias_recientes ?? []).filter((t) =>
        ["pendiente", "en_transito"].includes(t.estado),
      ),
    [resumen],
  );

  const colaInventarios = useMemo(
    () => (resumen?.inventarios_recientes ?? []).filter((i) => i.estado === "en_curso"),
    [resumen],
  );

  const movimientosVisibles: MovimientoItem[] = filtrados
    ? filtrados.items
    : (resumen?.movimientos_recientes ?? []);

  const maxStock = Math.max(1, ...(resumen?.stock_por_deposito.map((s) => s.total) ?? [1]));

  const aplicarFiltro = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "40", offset: "0" });
      if (accion) params.set("accion", accion);
      if (search.trim()) params.set("search", search.trim());
      const data = await apiFetch<MovimientosPage>(`/movimientos?${params.toString()}`);
      setFiltrados(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al filtrar movimientos");
    } finally {
      setBusy(false);
    }
  };

  const limpiarFiltro = () => {
    setAccion("");
    setSearch("");
    setFiltrados(null);
  };

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="Operaciones" subtitle="Atención pendiente, stock y actividad reciente" />
        <p className="muted" aria-busy="true">
          Cargando operaciones…
        </p>
        <div className="kpi-grid kpi-skeleton" aria-hidden>
          <div className="kpi-card skeleton-block" />
          <div className="kpi-card skeleton-block" />
          <div className="kpi-card skeleton-block" />
          <div className="kpi-card skeleton-block" />
        </div>
      </div>
    );
  }

  if (!resumen) {
    return (
      <div className="page">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn primary" onClick={loadResumen}>
          Reintentar
        </button>
      </div>
    );
  }

  const { kpis } = resumen;
  const disc = kpis.discrepancias_inventarios_cerrados;
  const sinUbicar = Math.max(0, kpis.activos_activos - kpis.stock_total_ubicado);
  const cobertura =
    kpis.activos_activos > 0
      ? Math.round((kpis.stock_total_ubicado / kpis.activos_activos) * 100)
      : 0;
  const primerUso =
    kpis.activos_activos === 0 &&
    kpis.depositos_activos === 0 &&
    colaTransferencias.length === 0 &&
    colaInventarios.length === 0;

  return (
    <div className="page">
      <PageHeader
        title="Operaciones"
        subtitle="Atención pendiente, stock y actividad reciente"
      >
        <button type="button" className="btn secondary" onClick={loadResumen}>
          Actualizar
        </button>
      </PageHeader>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {primerUso && (
        <section className="card panel-focus getting-started">
          <EmptyState
            title="Puesta en marcha"
            description="Configurá maestros y empezá a operar el WMS en tres pasos."
            steps={[
              "Creá depósitos con sectores y ubicaciones",
              "Cargá activos y asignales ubicación",
              "Hacé inventarios desde la APK MC33 y transferencias desde web o móvil",
            ]}
            action={
              <div className="getting-started-actions">
                {perms.canWriteWarehouse && (
                  <button
                    type="button"
                    className="btn primary btn-sm"
                    onClick={() => onNavigate?.("depositos")}
                  >
                    Ir a depósitos
                  </button>
                )}
                {perms.canWriteAssets && (
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    onClick={() => onNavigate?.("activos")}
                  >
                    Ir a activos
                  </button>
                )}
              </div>
            }
          />
        </section>
      )}

      <section className="kpi-grid" aria-label="Indicadores operativos">
        <button
          type="button"
          className={`kpi-card interactive ${kpis.transferencias_abiertas > 0 ? "tone-warn" : ""}`}
          onClick={() => onNavigate?.("transferencias")}
        >
          <span className="kpi-label">Transferencias abiertas</span>
          <strong className="kpi-value">{kpis.transferencias_abiertas}</strong>
          <span className="kpi-hint">Ir a cola</span>
        </button>

        <button
          type="button"
          className={`kpi-card interactive ${kpis.inventarios_abiertos > 0 ? "tone-warn" : ""}`}
          onClick={() => onNavigate?.("inventarios")}
        >
          <span className="kpi-label">Inventarios abiertos</span>
          <strong className="kpi-value">{kpis.inventarios_abiertos}</strong>
          <span className="kpi-hint">Ir a auditoría</span>
        </button>

        <button
          type="button"
          className={`kpi-card interactive ${disc.inventarios_con_discrepancia > 0 ? "tone-danger" : ""}`}
          onClick={() => {
            sessionStorage.setItem("dn_inv_filter", "discrepancias");
            onNavigate?.("inventarios");
          }}
        >
          <span className="kpi-label">Discrepancias</span>
          <strong className="kpi-value">{disc.inventarios_con_discrepancia}</strong>
          <span className="kpi-hint">
            {disc.faltantes} falt. · {disc.sobrantes} sobr.
          </span>
        </button>

        <button
          type="button"
          className={`kpi-card interactive ${sinUbicar > 0 ? "tone-warn" : "tone-ok"}`}
          onClick={() => {
            sessionStorage.setItem("dn_act_filter", "sin");
            onNavigate?.("activos");
          }}
        >
          <span className="kpi-label">Sin ubicación</span>
          <strong className="kpi-value">{sinUbicar}</strong>
          <span className="kpi-hint">
            {kpis.stock_total_ubicado}/{kpis.activos_activos} ubicados · {cobertura}%
          </span>
        </button>
      </section>

      <div className="dash-layout">
        <section className="card panel">
          <div className="section-header">
            <h3>Cola operativa</h3>
            <span className="muted">
              {colaTransferencias.length + colaInventarios.length} pendientes
            </span>
          </div>

          {colaTransferencias.length === 0 && colaInventarios.length === 0 ? (
            <EmptyState
              title="Cola al día"
              description="No hay transferencias ni inventarios abiertos que requieran atención."
              steps={
                primerUso
                  ? undefined
                  : [
                      "Los inventarios se operan en la APK MC33; acá los auditás",
                      "Usá Transferencias para mover stock entre depósitos",
                    ]
              }
              action={
                <div className="getting-started-actions">
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    onClick={() => onNavigate?.("inventarios")}
                  >
                    Ver inventarios
                  </button>
                  {perms.canWriteTransfer && (
                    <button
                      type="button"
                      className="btn primary btn-sm"
                      onClick={() => onNavigate?.("transferencias")}
                    >
                      Nueva transferencia
                    </button>
                  )}
                </div>
              }
            />
          ) : (
            <ul className="ops-queue">
              {colaTransferencias.map((t: TransferenciaResumenDash) => (
                <li key={`x-${t.id}`}>
                  <button
                    type="button"
                    className="ops-item"
                    onClick={() => onNavigate?.("transferencias")}
                  >
                    <span className="badge warn">{estadoXfer(t.estado)}</span>
                    <span className="ops-body">
                      <strong>Transferencia</strong>
                      <span className="muted">
                        {t.deposito_origen_nombre ?? "?"} → {t.deposito_destino_nombre ?? "?"} ·{" "}
                        {t.confirmados_destino}/{t.total_activos} activos
                      </span>
                    </span>
                    <span className="ops-time muted">{formatFecha(t.creado_en)}</span>
                  </button>
                </li>
              ))}
              {colaInventarios.map((inv: InventarioResumenDash) => (
                <li key={`i-${inv.id}`}>
                  <button
                    type="button"
                    className="ops-item"
                    onClick={() => onNavigate?.("inventarios")}
                  >
                    <span className="badge warn">En curso</span>
                    <span className="ops-body">
                      <strong>Inventario</strong>
                      <span className="muted">
                        {inv.deposito_nombre ?? "?"} · esperado {inv.total_esperado} · leídos{" "}
                        {inv.total_encontrado}
                      </span>
                    </span>
                    <span className="ops-time muted">{formatFecha(inv.iniciado_en)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card panel">
          <div className="section-header">
            <h3>Stock por depósito</h3>
            <button
              type="button"
              className="btn secondary btn-sm"
              onClick={() => onNavigate?.("depositos")}
            >
              Ver depósitos
            </button>
          </div>
          {resumen.stock_por_deposito.length === 0 ? (
            <EmptyState
              title="Sin depósitos activos"
              description="Sin estructura de depósitos no hay stock ubicado para operar."
              action={
                perms.canWriteWarehouse ? (
                  <button
                    type="button"
                    className="btn primary btn-sm"
                    onClick={() => onNavigate?.("depositos")}
                  >
                    Configurar depósitos
                  </button>
                ) : undefined
              }
            />
          ) : (
            <ul className="stock-bars" aria-label="Stock por depósito">
              {resumen.stock_por_deposito.map((s) => (
                <li key={s.deposito_id}>
                  <div className="stock-bar-head">
                    <span>{s.deposito_nombre}</span>
                    <strong>{s.total}</strong>
                  </div>
                  <div className="stock-bar-track" aria-hidden>
                    <div
                      className="stock-bar-fill"
                      style={{ width: `${Math.round((s.total / maxStock) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card panel">
        <div className="section-header">
          <h3>Actividad</h3>
          <div className="section-header-right">
            {filtrados && (
              <span className="muted">
                {filtrados.total} resultado{filtrados.total === 1 ? "" : "s"}
              </span>
            )}
            <ExportButtons
              basePath="/reportes/movimientos"
              filenameBase="movimientos"
              query={{
                accion: accion || undefined,
                search: search.trim() || undefined,
              }}
            />
          </div>
        </div>

        <form className="toolbar" onSubmit={aplicarFiltro} aria-label="Filtrar movimientos">
          <label className="field toolbar-field">
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
          <label className="field toolbar-field grow">
            <span>Buscar</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Patrimonial o descripción"
            />
          </label>
          <div className="toolbar-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Filtrando…" : "Filtrar"}
            </button>
            {filtrados && (
              <button type="button" className="btn secondary" onClick={limpiarFiltro}>
                Limpiar
              </button>
            )}
          </div>
        </form>

        {movimientosVisibles.length === 0 ? (
          <EmptyState
            title="Sin actividad"
            description={
              filtrados
                ? "Ningún movimiento coincide con el filtro."
                : "Cuando creés, asignes o transfieras activos, aparecerán aquí."
            }
            action={
              filtrados ? (
                <button type="button" className="btn secondary btn-sm" onClick={limpiarFiltro}>
                  Limpiar filtro
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-wrap table-panel">
            <table className="data-table dense sticky-head">
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Acción</th>
                  <th>Activo</th>
                  <th className="col-hide-sm">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movimientosVisibles.map((m) => (
                  <tr key={m.id}>
                    <td className="muted">{formatFecha(m.creado_en)}</td>
                    <td>{formatAccion(m.accion)}</td>
                    <td>
                      <span className="mono">{m.numero_patrimonial ?? "—"}</span>
                      {m.descripcion && (
                        <span className="muted desc-hide-sm"> · {m.descripcion}</span>
                      )}
                    </td>
                    <td className="muted col-hide-sm">{m.usuario_nombre ?? "Sistema"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
