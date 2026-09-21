import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import type {
  DashboardResumen,
  DispositivoMovilDash,
  InventarioResumenDash,
  MovimientoItem,
  MovimientosPage,
  TransferenciaResumenDash,
} from "../types";
import EmptyState from "./EmptyState";
import ExportButtons from "./ExportButtons";
import PageHeader from "./PageHeader";
import { usePermissions } from "../lib/usePermissions";

export type AppPage =
  | "dashboard"
  | "activos"
  | "depositos"
  | "inventarios"
  | "transferencias"
  | "usuarios"
  | "roles";

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

type AttentionSeverity = "danger" | "warn";

interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  badge: string;
  title: string;
  detail: string;
  when?: string | null;
  page: AppPage;
  filterKey?: string;
  filterValue?: string;
}

interface DashboardPageProps {
  onNavigate?: (page: AppPage) => void;
}

/** Poll silencioso mientras Operaciones está abierta: En línea → Inactivo sin F5. */
const DEVICES_POLL_MS = 35_000;

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const perms = usePermissions();
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [filtrados, setFiltrados] = useState<MovimientosPage | null>(null);
  const [accion, setAccion] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (!silent) setFiltrados(null);
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
    const timer = window.setInterval(() => {
      void loadResumen(undefined, { silent: true });
    }, DEVICES_POLL_MS);
    return () => {
      ac.abort();
      window.clearInterval(timer);
    };
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

  const movimientosVisibles: MovimientoItem[] = filtrados
    ? filtrados.items
    : (resumen?.movimientos_recientes ?? []);

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

  const verMovimiento = (m: MovimientoItem) => {
    sessionStorage.setItem("dn_act_focus", m.activo_id);
    if (m.numero_patrimonial) {
      sessionStorage.setItem("dn_act_search", m.numero_patrimonial);
    } else {
      sessionStorage.removeItem("dn_act_search");
    }
    onNavigate?.("activos");
  };

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="Operaciones" leading={<span>Cargando…</span>} />
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
        <PageHeader title="Operaciones" />
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

  const atencion: AttentionItem[] = [];
  let listadosDisc = 0;
  let listadosSinAuditar = 0;
  const discPendiente = kpis.inventarios_con_discrepancia_pendiente ?? 0;
  const auditPendiente = kpis.inventarios_pendientes_auditoria ?? 0;

  for (const inv of resumen.inventarios_recientes) {
    if (inv.estado !== "cerrado") continue;
    // Sin `auditado` en el payload no podemos saber si ya se cerró la alerta.
    if (typeof inv.auditado !== "boolean") continue;
    if (inv.auditado) continue;

    const conDiff = inv.total_faltante > 0 || (inv.total_exceso ?? 0) > 0;
    listadosSinAuditar += 1;
    if (conDiff) {
      listadosDisc += 1;
      const exceso = inv.total_exceso ?? 0;
      atencion.push({
        id: `inv-disc-${inv.id}`,
        severity: "danger",
        badge: "Discrepancia",
        title: `Inventario · ${inv.deposito_nombre ?? "Depósito"}`,
        detail: `${inv.total_faltante} faltante${inv.total_faltante === 1 ? "" : "s"} · ${exceso} exceso${exceso === 1 ? "" : "s"} · sin auditar`,
        when: inv.cerrado_en,
        page: "inventarios",
        filterKey: "dn_inv_filter",
        filterValue: "discrepancias",
      });
    } else {
      atencion.push({
        id: `inv-audit-${inv.id}`,
        severity: "warn",
        badge: "Auditoría",
        title: `Inventario · ${inv.deposito_nombre ?? "Depósito"}`,
        detail: "Cerrado y pendiente de marcar como auditado",
        when: inv.cerrado_en,
        page: "inventarios",
        filterKey: "dn_inv_filter",
        filterValue: "pendiente_auditoria",
      });
    }
  }

  const restoDisc = Math.max(0, discPendiente - listadosDisc);
  const listadosSoloAudit = Math.max(0, listadosSinAuditar - listadosDisc);
  const restoAudit = Math.max(0, auditPendiente - discPendiente - listadosSoloAudit);

  if (restoDisc > 0) {
    atencion.push({
      id: "inv-disc-more",
      severity: "danger",
      badge: "Discrepancia",
      title: `${restoDisc} inventario${restoDisc === 1 ? "" : "s"} con diferencia`,
      detail: "Cerrados, con faltantes/excesos y aún sin auditar",
      page: "inventarios",
      filterKey: "dn_inv_filter",
      filterValue: "discrepancias",
    });
  }

  if (restoAudit > 0) {
    atencion.push({
      id: "inv-audit-more",
      severity: "warn",
      badge: "Auditoría",
      title: `${restoAudit} inventario${restoAudit === 1 ? "" : "s"} sin auditar`,
      detail: "Sesiones cerradas sin diferencia, pendientes de revisión",
      page: "inventarios",
      filterKey: "dn_inv_filter",
      filterValue: "pendiente_auditoria",
    });
  }

  if (sinUbicar > 0) {
    atencion.push({
      id: "act-sin-ubi",
      severity: "warn",
      badge: "Ubicación",
      title: `${sinUbicar} activo${sinUbicar === 1 ? "" : "s"} sin ubicación`,
      detail: `${cobertura}% de cobertura · ${kpis.stock_total_ubicado}/${kpis.activos_activos} ubicados`,
      page: "activos",
      filterKey: "dn_act_filter",
      filterValue: "sin",
    });
  }

  // Priorizar críticos primero
  atencion.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "danger" ? -1 : 1;
  });

  const openAttention = (item: AttentionItem) => {
    if (item.filterKey && item.filterValue) {
      sessionStorage.setItem(item.filterKey, item.filterValue);
    }
    onNavigate?.(item.page);
  };

  return (
    <div className="page">
      <PageHeader
        title="Operaciones"
        subtitle="Qué necesita tu atención hoy"
        leading={
          pendientesCola > 0 ? (
            <span>
              {pendientesCola} en curso
            </span>
          ) : null
        }
      >
        <button
          type="button"
          className="btn secondary btn-sm"
          onClick={() => void loadResumen()}
        >
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
          onClick={() => {
            sessionStorage.setItem("dn_xfer_filter", "abiertas");
            onNavigate?.("transferencias");
          }}
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
          onClick={() => {
            sessionStorage.setItem("dn_inv_filter", "en_curso");
            onNavigate?.("inventarios");
          }}
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
          onClick={() => {
            sessionStorage.setItem("dn_inv_filter", "pendiente_auditoria");
            onNavigate?.("inventarios");
          }}
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
          onClick={() => {
            sessionStorage.setItem("dn_act_filter", "sin");
            onNavigate?.("activos");
          }}
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
            <h3>En curso ahora</h3>
            <span className="muted">
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
                      onClick={() => {
                        sessionStorage.setItem("dn_xfer_filter", "abiertas");
                        onNavigate?.("transferencias");
                      }}
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
                      <span className="ops-progress" aria-hidden>
                        <span className="ops-progress-meta">
                          <span>
                            Confirmados en destino {t.confirmados_destino}/{t.total_activos}
                          </span>
                          <span>{avance}%</span>
                        </span>
                        <span className="ops-progress-track">
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
                      onClick={() => {
                        sessionStorage.setItem("dn_inv_filter", "en_curso");
                        onNavigate?.("inventarios");
                      }}
                    >
                      <span className="badge warn">En curso</span>
                      <span className="ops-body">
                        <strong>Inventario</strong>
                        <span className="muted">{inv.deposito_nombre ?? "?"}</span>
                      </span>
                      <span className="ops-time muted">{formatFecha(inv.iniciado_en)}</span>
                      <span className="ops-progress" aria-hidden>
                        <span className="ops-progress-meta">
                          <span>
                            Leídos {inv.total_encontrado}/{inv.total_esperado} esperados
                          </span>
                          <span>{avance}%</span>
                        </span>
                        <span className="ops-progress-track">
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

        <section className={`card ${atencion.length > 0 ? "attn-card" : "attn-card is-clear"}`}>
            <div className="section-header">
              <h3>Requiere atención</h3>
              <span className="muted">
                {atencion.length === 0
                  ? "Sin alertas"
                  : `${atencion.length} ítem${atencion.length === 1 ? "" : "s"}`}
              </span>
            </div>
            {atencion.length === 0 ? (
              <EmptyState
                title="Todo en orden"
                description="No hay discrepancias, auditorías pendientes ni activos sin ubicación."
              />
            ) : (
              <ul className="ops-queue attn-queue" aria-label="Bandeja de atención">
                {atencion.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`ops-item attn-item severity-${item.severity}`}
                      onClick={() => openAttention(item)}
                    >
                      <span className={`badge ${item.severity}`}>{item.badge}</span>
                      <span className="ops-body">
                        <strong>{item.title}</strong>
                        <span className="muted">{item.detail}</span>
                      </span>
                      {item.when && (
                        <span className="ops-time muted">{formatFecha(item.when)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
      </div>

      <section className="card devices-card">
        <div className="section-header">
          <h3 title="En línea = heartbeat reciente · Inactivo = sesión abierta sin reportes recientes (app cerrada, equipo apagado, sin red) · Sesión cerrada = logout">
            Dispositivos MC33
          </h3>
          <span className="muted">
            {dispositivos.length === 0
              ? "Sin registros"
              : [
                  `${dispositivosOnline} en línea`,
                  dispositivosInactivos > 0 ? `${dispositivosInactivos} inactivo${dispositivosInactivos === 1 ? "" : "s"}` : null,
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
                    <span className="ops-body">
                      <strong>
                        {d.modelo}
                        {d.numero_serie ? ` · S/N ${d.numero_serie}` : ""}
                      </strong>
                      <span className="muted">
                        {[d.fabricante, d.usuario_nombre ? `Usuario: ${d.usuario_nombre}` : null]
                          .filter(Boolean)
                          .join(" · ") || "Sin usuario"}
                        {d.app_version ? ` · App ${d.app_version}` : ""}
                      </span>
                    </span>
                    <time className="ops-time muted" dateTime={d.ultimo_visto_en}>
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

      <section className="card audit-card">
        <div className="section-header">
          <h3 title="Actividad del sistema (altas, ubicaciones, movimientos)">
            Auditoría reciente
          </h3>
          {filtrados && (
            <span className="muted audit-count">
              {filtrados.total} resultado{filtrados.total === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <form
          className="toolbar toolbar-compact"
          onSubmit={aplicarFiltro}
          aria-label="Filtrar movimientos"
        >
          <label className="field toolbar-field">
            <span className="sr-only">Acción</span>
            <select
              value={accion}
              onChange={(e) => setAccion(e.target.value)}
              aria-label="Acción"
            >
              <option value="">Acción</option>
              {Object.entries(ACCION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field toolbar-field grow">
            <span className="sr-only">Buscar</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar patrimonial o descripción…"
              aria-label="Buscar"
            />
          </label>
          <div className="toolbar-actions">
            <button type="submit" className="btn secondary" disabled={busy}>
              {busy ? "…" : "Filtrar"}
            </button>
            {filtrados && (
              <button type="button" className="btn secondary" onClick={limpiarFiltro}>
                Limpiar
              </button>
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
          <div className="table-wrap table-panel dash-scroll">
            <table className="data-table dense sticky-head">
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
        )}
      </section>
    </div>
  );
}
