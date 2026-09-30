import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import type {
  DashboardResumen,
  DispositivoMovilDash,
  InventarioResumenDash,
  MovimientoItem,
  MovimientosPage,
  TransferenciaResumenDash,
} from "../types";
import ActionsMenu from "./ActionsMenu";
import EmptyState from "./EmptyState";
import ExportButtons from "./ExportButtons";
import FilterSelect from "./FilterSelect";
import InventariosPage from "./InventariosPage";
import OpsTableTabs, {
  type OpsTableTab,
  readOpsTableTab,
  writeOpsTableTab,
} from "./OpsTableTabs";
import TablePager from "./TablePager";
import TransferenciasPage from "./TransferenciasPage";
import { usePermissions } from "../lib/usePermissions";
import { TABLE_PAGE_DEFAULT, normalizePageSize, type TablePageSize } from "../lib/tablePaging";
import { signalSessionNav } from "../lib/attentionItems";
import type { AppPage } from "../lib/appPages";

export type { AppPage } from "../lib/appPages";

const ACCION_LABELS: Record<string, string> = {
  creacion: "Alta",
  actualizacion: "Actualización",
  desactivacion: "Baja",
  asignacion_ubicacion: "Asignación",
  desasignacion_ubicacion: "Desasignación",
  etiqueta_impresa: "Etiqueta",
  etiqueta_codificada: "EPC",
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

function formatVistoHace(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(ms) || ms < 0) return formatFecha(iso);
    const mins = Math.floor(ms / 60_000);
    if (mins < 1) return "hace un momento";
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `hace ${days} d`;
  } catch {
    return formatFecha(iso);
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

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

interface DashboardPageProps {
  onNavigate?: (page: AppPage) => void;
}

/** Poll silencioso mientras Operaciones está abierta: En línea → Inactivo sin F5. */
const DEVICES_POLL_MS = 35_000;

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const perms = usePermissions();
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [historial, setHistorial] = useState<MovimientosPage | null>(null);
  const [histPageSize, setHistPageSize] = useState<TablePageSize>(TABLE_PAGE_DEFAULT);
  const [opsTab, setOpsTab] = useState<OpsTableTab>(() => readOpsTableTab() ?? "historial");
  const [accion, setAccion] = useState("");
  const [search, setSearch] = useState("");
  const [appliedAccion, setAppliedAccion] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const histOffsetRef = useRef(0);
  const appliedAccionRef = useRef("");
  const appliedSearchRef = useRef("");
  const histPageSizeRef = useRef<TablePageSize>(TABLE_PAGE_DEFAULT);
  const histSearchSkipRef = useRef(true);
  const accionRef = useRef(accion);
  accionRef.current = accion;

  const loadHistorial = useCallback(
    async (opts: {
      offset?: number;
      limit?: number;
      accion?: string;
      search?: string;
      signal?: AbortSignal;
      quiet?: boolean;
    } = {}) => {
      const limit = Math.max(1, opts.limit ?? histPageSizeRef.current);
      const offset = Math.max(0, opts.offset ?? 0);
      const acc = opts.accion ?? "";
      const q = (opts.search ?? "").trim();
      if (!opts.quiet) setBusy(true);
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        if (acc) params.set("accion", acc);
        if (q) params.set("search", q);
        const data = await apiFetch<MovimientosPage>(`/movimientos?${params.toString()}`, {
          signal: opts.signal,
        });
        if (opts.signal?.aborted) return;
        histOffsetRef.current = data.offset;
        setHistorial(data);
      } catch (err) {
        if (opts.signal?.aborted) return;
        if (!opts.quiet) {
          setError(err instanceof Error ? err.message : "Error al cargar el historial");
        }
      } finally {
        if (!opts.quiet && !opts.signal?.aborted) setBusy(false);
      }
    },
    [],
  );

  const loadResumen = useCallback(async (signal?: AbortSignal, opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await apiFetch<DashboardResumen>(
        "/dashboard/resumen?movimientos_limit=15&ops_limit=12",
        { signal },
      );
      if (signal?.aborted) return;
      setResumen(data);
    } catch (err) {
      if (signal?.aborted) return;
      // En poll silencioso no pisar la UI con error transitorio de red.
      if (!silent) {
        setError(err instanceof Error ? err.message : "Error al cargar el dashboard");
      }
    } finally {
      if (!silent && !signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void loadResumen(ac.signal);
    void loadHistorial({
      offset: 0,
      limit: TABLE_PAGE_DEFAULT,
      signal: ac.signal,
      quiet: true,
    });
    const timer = window.setInterval(() => {
      void loadResumen(undefined, { silent: true });
    }, DEVICES_POLL_MS);
    return () => {
      ac.abort();
      window.clearInterval(timer);
    };
  }, [loadResumen, loadHistorial]);

  useEffect(() => {
    writeOpsTableTab(opsTab);
  }, [opsTab]);

  useEffect(() => {
    const syncTab = () => {
      const t = readOpsTableTab();
      if (t) setOpsTab(t);
    };
    syncTab();
    window.addEventListener("dn-session-nav", syncTab);
    return () => window.removeEventListener("dn-session-nav", syncTab);
  }, []);

  useEffect(() => {
    histPageSizeRef.current = histPageSize;
  }, [histPageSize]);

  useEffect(() => {
    appliedAccionRef.current = appliedAccion;
    appliedSearchRef.current = appliedSearch;
  }, [appliedAccion, appliedSearch]);

  const changeHistPageSize = (next: number) => {
    const size = normalizePageSize(next);
    setHistPageSize(size);
    histPageSizeRef.current = size;
    void loadHistorial({
      offset: 0,
      limit: size,
      accion: appliedAccionRef.current,
      search: appliedSearchRef.current,
    });
  };

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

  const dispositivos: DispositivoMovilDash[] = resumen?.dispositivos_moviles ?? [];
  const dispositivosOnline = dispositivos.filter(
    (d) => (d.estado ?? (d.en_linea ? "en_linea" : d.sesion_activa ? "inactivo" : "sesion_cerrada")) === "en_linea",
  ).length;
  const dispositivosInactivos = dispositivos.filter(
    (d) => (d.estado ?? (d.en_linea ? "en_linea" : d.sesion_activa ? "inactivo" : "sesion_cerrada")) === "inactivo",
  ).length;

  function dispositivoEstado(d: DispositivoMovilDash): "en_linea" | "inactivo" | "sesion_cerrada" {
    if (d.estado === "en_linea" || d.estado === "inactivo" || d.estado === "sesion_cerrada") {
      return d.estado;
    }
    if (d.en_linea) return "en_linea";
    if (d.sesion_activa) return "inactivo";
    return "sesion_cerrada";
  }

  function dispositivoEstadoLabel(estado: "en_linea" | "inactivo" | "sesion_cerrada"): string {
    if (estado === "en_linea") return "En línea";
    if (estado === "inactivo") return "Inactivo";
    return "Sesión cerrada";
  }

  const movimientosVisibles: MovimientoItem[] = historial?.items ?? [];
  const histTotal = historial?.total ?? 0;
  const histOffset = historial?.offset ?? 0;
  const histLimit = historial?.limit ?? histPageSize;
  const histPage = Math.floor(histOffset / Math.max(histLimit, 1)) + 1;
  const histPages = Math.max(1, Math.ceil(histTotal / Math.max(histLimit, 1)));
  const histFrom = histTotal === 0 ? 0 : histOffset + 1;
  const histTo = Math.min(histOffset + movimientosVisibles.length, histTotal);
  const canHistPrev = histOffset > 0;
  const canHistNext = histOffset + histLimit < histTotal;
  const filtroActivo = Boolean(appliedAccion || appliedSearch);

  const applyHistorialFilters = useCallback(
    (nextAccion: string, nextSearch: string) => {
      const q = nextSearch.trim();
      setError(null);
      setAppliedAccion(nextAccion);
      setAppliedSearch(q);
      void loadHistorial({ offset: 0, accion: nextAccion, search: q });
    },
    [loadHistorial],
  );

  useEffect(() => {
    if (histSearchSkipRef.current) {
      histSearchSkipRef.current = false;
      return;
    }
    const q = search.trim();
    if (q === appliedSearchRef.current) return;
    const timer = window.setTimeout(() => {
      applyHistorialFilters(accionRef.current, search);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, applyHistorialFilters]);

  const onAccionFilterChange = (value: string) => {
    setAccion(value);
    applyHistorialFilters(value, search);
  };

  const limpiarFiltro = () => {
    histSearchSkipRef.current = true;
    setAccion("");
    setSearch("");
    setAppliedAccion("");
    setAppliedSearch("");
    void loadHistorial({ offset: 0, accion: "", search: "" });
  };

  const irHistPrev = () => {
    if (!canHistPrev || busy) return;
    void loadHistorial({
      offset: Math.max(0, histOffset - histLimit),
      accion: appliedAccion,
      search: appliedSearch,
    });
  };

  const irHistNext = () => {
    if (!canHistNext || busy) return;
    void loadHistorial({
      offset: histOffset + histLimit,
      accion: appliedAccion,
      search: appliedSearch,
    });
  };

  const verMovimiento = (m: MovimientoItem) => {
    sessionStorage.setItem("dn_act_focus", m.activo_id);
    if (m.numero_patrimonial) {
      sessionStorage.setItem("dn_act_search", m.numero_patrimonial);
    } else {
      sessionStorage.removeItem("dn_act_search");
    }
    signalSessionNav();
    onNavigate?.("activos");
  };

  const goWithFilter = (page: AppPage, key: string, value: string) => {
    sessionStorage.setItem(key, value);
    if (page === "inventarios") {
      setOpsTab("inventarios");
      writeOpsTableTab("inventarios");
      signalSessionNav();
      return;
    }
    if (page === "transferencias") {
      setOpsTab("movimientos");
      writeOpsTableTab("movimientos");
      signalSessionNav();
      return;
    }
    signalSessionNav();
    onNavigate?.(page);
  };

  const openOpsSection = (tab: OpsTableTab) => {
    setOpsTab(tab);
    writeOpsTableTab(tab);
  };

  const opsTabsId = useId();
  const opsTabs = (
    <OpsTableTabs id={opsTabsId} value={opsTab} onChange={openOpsSection} />
  );

  if (loading) {
    return (
      <div className="page page-ops" aria-busy="true">
        <span className="sr-only" role="status">
          Cargando…
        </span>
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
      <div className="page page-ops">
        <section className="card">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <EmptyState
            title="No se pudo cargar el tablero"
            description="Revisá la conexión con la API y volvé a intentar."
            action={
              <button
                type="button"
                className="btn primary btn-sm"
                onClick={() => void loadResumen()}
              >
                Reintentar
              </button>
            }
          />
        </section>
      </div>
    );
  }

  const { kpis } = resumen;
  const disc = kpis.discrepancias_inventarios_cerrados;
  // Derivar de stock si el API aún no envía los campos (servidor desactualizado).
  const sinUbicar =
    typeof kpis.activos_sin_ubicacion === "number"
      ? kpis.activos_sin_ubicacion
      : Math.max(0, kpis.activos_activos - kpis.stock_total_ubicado);
  const cobertura =
    typeof kpis.cobertura_ubicacion_pct === "number"
      ? kpis.cobertura_ubicacion_pct
      : kpis.activos_activos > 0
        ? Math.round((kpis.stock_total_ubicado / kpis.activos_activos) * 100)
        : 0;
  const pendientesCola = colaTransferencias.length + colaInventarios.length;
  const primerUso =
    kpis.activos_activos === 0 &&
    kpis.depositos_activos === 0 &&
    colaTransferencias.length === 0 &&
    colaInventarios.length === 0;

  return (
    <div className="page page-ops">
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
              "Hacé inventarios desde la APK MC33 y movimientos desde web o móvil",
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
          className={`kpi-card interactive ${kpis.transferencias_activos_pendientes > 0 ? "tone-warn" : "tone-ok"}`}
          onClick={() => goWithFilter("transferencias", "dn_xfer_filter", "abiertas")}
        >
          <span className="kpi-label">Ejecución de movimientos</span>
          <strong className="kpi-value">{kpis.transferencias_avance_pct}%</strong>
          <span className="kpi-status">
            {kpis.transferencias_abiertas > 0 ? "Movimiento en curso" : "Sin órdenes abiertas"}
          </span>
          <span className="kpi-hint">
            {kpis.transferencias_activos_pendientes} activo{kpis.transferencias_activos_pendientes === 1 ? "" : "s"} por recibir ·{" "}
            {kpis.transferencias_en_transito} en tránsito
          </span>
        </button>

        <button
          type="button"
          className={`kpi-card interactive ${kpis.inventarios_activos_pendientes > 0 ? "tone-warn" : "tone-ok"}`}
          onClick={() => goWithFilter("inventarios", "dn_inv_filter", "en_curso")}
        >
          <span className="kpi-label">Avance de inventarios</span>
          <strong className="kpi-value">{kpis.inventarios_avance_pct}%</strong>
          <span className="kpi-status">
            {kpis.inventarios_abiertos > 0 ? "Conteo en MC33" : "Sin sesiones abiertas"}
          </span>
          <span className="kpi-hint">
            {kpis.inventarios_activos_pendientes} activo{kpis.inventarios_activos_pendientes === 1 ? "" : "s"} por relevar ·{" "}
            {kpis.inventarios_abiertos} sesión{kpis.inventarios_abiertos === 1 ? "" : "es"}
          </span>
        </button>

        <button
          type="button"
          className={`kpi-card interactive ${kpis.inventarios_pendientes_auditoria > 0 ? "tone-danger" : "tone-ok"}`}
          onClick={() => goWithFilter("inventarios", "dn_inv_filter", "pendiente_auditoria")}
        >
          <span className="kpi-label">Auditoría pendiente</span>
          <strong className="kpi-value">{kpis.inventarios_pendientes_auditoria}</strong>
          <span className="kpi-status">
            {kpis.inventarios_pendientes_auditoria > 0 ? "Revisión requerida" : "Todo auditado"}
          </span>
          <span className="kpi-hint">
            {kpis.inventarios_con_discrepancia_pendiente} con diferencia · {disc.faltantes} falt. · {disc.sobrantes} exc.
          </span>
        </button>

        <button
          type="button"
          className={`kpi-card interactive ${sinUbicar > 0 ? "tone-warn" : "tone-ok"}`}
          onClick={() => goWithFilter("activos", "dn_act_filter", "sin")}
        >
          <span className="kpi-label">Cobertura de ubicación</span>
          <strong className="kpi-value">{cobertura}%</strong>
          <span className="kpi-status">
            {sinUbicar > 0 ? `${sinUbicar} sin ubicar` : "Cobertura completa"}
          </span>
          <span className="kpi-hint">
            {kpis.stock_total_ubicado}/{kpis.activos_activos} ubicados
          </span>
        </button>
      </section>

      <div className="dash-split">
        <section className="card">
          <div className="section-header">
            <h2>En curso ahora</h2>
            <span className="section-count">
              {pendientesCola === 0
                ? "Nada pendiente"
                : `${pendientesCola} ítem${pendientesCola === 1 ? "" : "s"}`}
            </span>
          </div>

          {colaTransferencias.length === 0 && colaInventarios.length === 0 ? (
            <EmptyState
              title="Cola al día"
              description="No hay movimientos ni inventarios abiertos que requieran atención."
              steps={
                primerUso
                  ? undefined
                  : [
                      "Los inventarios se operan en la APK MC33; acá los auditás",
                      "Usá Movimientos para trasladar stock o entregar a personas",
                    ]
              }
              action={
                <div className="getting-started-actions">
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    onClick={() => openOpsSection("inventarios")}
                  >
                    Ver inventarios
                  </button>
                  {perms.canWriteTransfer && (
                    <button
                      type="button"
                      className="btn primary btn-sm"
                      onClick={() => openOpsSection("movimientos")}
                    >
                      Nueva transferencia
                    </button>
                  )}
                  {perms.canManageUsers && (
                    <button
                      type="button"
                      className="btn secondary btn-sm"
                      onClick={() => onNavigate?.("usuarios")}
                    >
                      Gestionar usuarios
                    </button>
                  )}
                </div>
              }
            />
          ) : (
            <ul className="ops-queue">
              {colaTransferencias.map((t: TransferenciaResumenDash) => {
                const avance = pct(t.confirmados_destino, t.total_activos);
                return (
                  <li key={`x-${t.id}`}>
                    <button
                      type="button"
                      className="ops-item"
                      onClick={() => goWithFilter("transferencias", "dn_xfer_filter", "abiertas")}
                    >
                      <span className="badge warn">{estadoXfer(t.estado)}</span>
                      <span className="ops-body">
                        <strong>
                          {t.tipo === "persona" ? "Entrega" : "Movimiento"}
                        </strong>
                        <span className="muted">
                          {t.deposito_origen_nombre ?? "?"} →{" "}
                          {t.tipo === "persona"
                            ? (t.persona_destino_nombre ?? "Persona")
                            : (t.deposito_destino_nombre ?? "?")}
                        </span>
                      </span>
                      <span className="ops-time muted">{formatFecha(t.creado_en)}</span>
                      <span className="ops-progress">
                        <span className="ops-progress-meta">
                          <span>
                            Confirmados en destino {t.confirmados_destino}/{t.total_activos}
                          </span>
                          <span>{avance}%</span>
                        </span>
                        <span className="ops-progress-track" aria-hidden>
                          <span
                            className={`ops-progress-fill ${avance < 100 ? "is-warn" : ""}`}
                            style={{ width: `${avance}%` }}
                          />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {colaInventarios.map((inv: InventarioResumenDash) => {
                const avance = pct(inv.total_encontrado, inv.total_esperado);
                return (
                  <li key={`i-${inv.id}`}>
                    <button
                      type="button"
                      className="ops-item"
                      onClick={() => goWithFilter("inventarios", "dn_inv_filter", "en_curso")}
                    >
                      <span className="badge warn">En curso</span>
                      <span className="ops-body">
                        <strong>Inventario</strong>
                        <span className="muted">{inv.deposito_nombre ?? "?"}</span>
                      </span>
                      <span className="ops-time muted">{formatFecha(inv.iniciado_en)}</span>
                      <span className="ops-progress">
                        <span className="ops-progress-meta">
                          <span>
                            Leídos {inv.total_encontrado}/{inv.total_esperado} esperados
                          </span>
                          <span>{avance}%</span>
                        </span>
                        <span className="ops-progress-track" aria-hidden>
                          <span
                            className={`ops-progress-fill ${avance < 100 ? "is-warn" : ""}`}
                            style={{ width: `${Math.max(avance, avance > 0 ? 4 : 0)}%` }}
                          />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card devices-card">
          <div className="section-header">
            <h2 title="En línea = heartbeat reciente · Inactivo = sesión abierta sin reportes recientes (app cerrada, equipo apagado, sin red) · Sesión cerrada = logout">
              Dispositivos
            </h2>
            <span className="section-count">
              {dispositivos.length === 0
                ? "Sin registros"
                : [
                    `${dispositivosOnline} en línea`,
                    dispositivosInactivos > 0
                      ? `${dispositivosInactivos} inactivo${dispositivosInactivos === 1 ? "" : "s"}`
                      : null,
                    `${dispositivos.length} registrado${dispositivos.length === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
          </div>
          {dispositivos.length === 0 ? (
            <EmptyState
              title="Ningún lector registrado"
              description="Cuando un operador inicia sesión en la APK, el dispositivo aparece acá. Si deja de reportar (app cerrada, equipo apagado, sin red) queda Inactivo; al cerrar sesión, Sesión cerrada."
            />
          ) : (
            <ul className="ops-queue device-queue" aria-label="Dispositivos móviles registrados">
              {dispositivos.map((d) => {
                const vistoAbs = formatFecha(d.ultimo_visto_en);
                const estado = dispositivoEstado(d);
                const estadoLabel = dispositivoEstadoLabel(estado);
                const badgeClass =
                  estado === "en_linea" ? "ok" : estado === "inactivo" ? "warn" : "muted";
                const rowClass =
                  estado === "en_linea"
                    ? "is-online"
                    : estado === "inactivo"
                      ? "is-idle"
                      : "is-offline";
                return (
                  <li key={d.id}>
                    <div
                      className={`device-row ${rowClass}`}
                      aria-label={`${d.modelo}${d.numero_serie ? `, serie ${d.numero_serie}` : ""}, ${estadoLabel}, visto ${vistoAbs}`}
                    >
                      <span className={`badge ${badgeClass}`}>{estadoLabel}</span>
                      <span className="device-main">
                        <strong className="device-name">
                          {d.modelo}
                          {d.numero_serie ? ` · S/N ${d.numero_serie}` : ""}
                        </strong>
                        <span className="device-meta muted">
                          {[
                            d.fabricante,
                            d.usuario_nombre ? d.usuario_nombre : null,
                            d.app_version ? `App ${d.app_version}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Sin usuario"}
                        </span>
                      </span>
                      <time className="device-seen muted" dateTime={d.ultimo_visto_en}>
                        {formatVistoHace(d.ultimo_visto_en)}
                        <span className="sr-only"> ({vistoAbs})</span>
                      </time>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="card audit-card">
        <div className="table-chrome ops-main-chrome">
          <div className="table-chrome-leading">{opsTabs}</div>
          {opsTab === "historial" && (
            <div
              className="table-chrome-controls"
              role="search"
              aria-label="Filtrar historial"
            >
              <label className="field toolbar-field grow">
                <span className="sr-only">Buscar</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar patrimonial, usuario…"
                  aria-label="Buscar"
                />
              </label>
              <FilterSelect
                placeholder="Acción"
                aria-label="Acción"
                value={accion}
                onChange={onAccionFilterChange}
                options={Object.entries(ACCION_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
              {filtroActivo && (
                <button type="button" className="btn ghost btn-sm" onClick={limpiarFiltro}>
                  Limpiar
                </button>
              )}
              <ActionsMenu
                disabled={busy}
                items={[
                  {
                    id: "refresh",
                    label: busy ? "Cargando…" : "Actualizar",
                    disabled: busy,
                    onClick: () =>
                      void loadHistorial({
                        offset: histOffset,
                        accion: appliedAccion,
                        search: appliedSearch,
                      }),
                  },
                ]}
              >
                <ExportButtons
                  variant="items"
                  basePath="/reportes/movimientos"
                  filenameBase="movimientos"
                  query={{
                    accion: appliedAccion || undefined,
                    search: appliedSearch || undefined,
                  }}
                />
              </ActionsMenu>
            </div>
          )}
        </div>

        <div
          id={`${opsTabsId}-panel-historial`}
          className={`ops-section-panel${opsTab === "historial" ? " is-active" : ""}`}
          hidden={opsTab !== "historial"}
          role="tabpanel"
          aria-labelledby={`${opsTabsId}-tab-historial`}
        >
          {movimientosVisibles.length === 0 ? (
            <div className="audit-body">
              <EmptyState
                title="Sin actividad"
                description={
                  filtroActivo
                    ? "Ningún movimiento coincide con el filtro."
                    : "Cuando creés, asignes o transfieras activos, aparecerán aquí."
                }
                action={
                  filtroActivo ? (
                    <button type="button" className="btn secondary btn-sm" onClick={limpiarFiltro}>
                      Limpiar filtro
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <div className="audit-body">
                <div className="table-wrap table-panel dash-scroll audit-table-wrap">
                  <table className="data-table dense sticky-head audit-table">
                    <thead>
                      <tr>
                        <th>Cuándo</th>
                        <th>Acción</th>
                        <th>Activo</th>
                        <th className="col-hide-sm">Usuario</th>
                        <th className="col-actions">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody key={`p-${histPage}-s-${histLimit}`} className="ui-enter">
                      {movimientosVisibles.map((m) => (
                        <tr key={m.id}>
                          <td className="muted audit-when">{formatFecha(m.creado_en)}</td>
                          <td>
                            <span className="audit-action">{formatAccion(m.accion)}</span>
                          </td>
                          <td>
                            <span className="mono">{m.numero_patrimonial ?? "—"}</span>
                            {m.descripcion && (
                              <span className="muted desc-hide-sm"> · {m.descripcion}</span>
                            )}
                          </td>
                          <td className="muted col-hide-sm">{m.usuario_nombre ?? "Sistema"}</td>
                          <td className="col-actions">
                            <div className="row-actions">
                              <button
                                type="button"
                                className="btn ghost btn-sm"
                                onClick={() => verMovimiento(m)}
                                aria-label={`Ver detalle de ${formatAccion(m.accion)} · ${m.numero_patrimonial ?? "activo"}`}
                              >
                                Ver
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {histTotal > 0 && (
                <TablePager
                  from={histFrom}
                  to={histTo}
                  total={histTotal}
                  page={histPage}
                  pages={histPages}
                  pageSize={histPageSize}
                  canPrev={canHistPrev}
                  canNext={canHistNext}
                  busy={busy}
                  onPrev={irHistPrev}
                  onNext={irHistNext}
                  onPageSizeChange={changeHistPageSize}
                  label="Paginación del historial"
                />
              )}
            </>
          )}
        </div>

        <div
          id={`${opsTabsId}-panel-inventarios`}
          className={`ops-section-panel ops-section-embed${opsTab === "inventarios" ? " is-active" : ""}`}
          hidden={opsTab !== "inventarios"}
          role="tabpanel"
          aria-labelledby={`${opsTabsId}-tab-inventarios`}
        >
          <InventariosPage embedded chromeLeading={null} />
        </div>

        <div
          id={`${opsTabsId}-panel-movimientos`}
          className={`ops-section-panel ops-section-embed${opsTab === "movimientos" ? " is-active" : ""}`}
          hidden={opsTab !== "movimientos"}
          role="tabpanel"
          aria-labelledby={`${opsTabsId}-tab-movimientos`}
        >
          <TransferenciasPage embedded chromeLeading={null} />
        </div>
      </section>
    </div>
  );
}
