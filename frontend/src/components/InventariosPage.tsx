import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../context/ToastContext";
import type {
  Deposito,
  DetalleInventario,
  Inventario,
  InventarioListItem,
  InventarioReporte,
} from "../types";
import PageHeader from "./PageHeader";
import ExportButtons from "./ExportButtons";
import EmptyState from "./EmptyState";
import Modal from "./Modal";
import {
  filterInventarios,
  hasActiveInventariosFilters,
} from "../lib/filterInventarios";
import { usePermissions } from "../lib/usePermissions";

function estadoInventario(estado: string): string {
  if (estado === "en_curso") return "En curso";
  if (estado === "cerrado") return "Cerrado";
  return estado;
}

function DetalleList({
  title,
  items,
  tone,
}: {
  title: string;
  items: DetalleInventario[];
  tone?: "danger" | "warn" | "ok";
}) {
  return (
    <div className={`reporte-block ${tone ? `tone-${tone}` : ""}`}>
      <h4>
        {title} ({items.length})
      </h4>
      {items.length === 0 ? (
        <p className="muted">Ninguno</p>
      ) : (
        <ul className="simple-list">
          {items.map((d) => (
            <li key={d.id}>
              <span className="mono">{d.numero_patrimonial ?? d.epc ?? "—"}</span>
              {d.descripcion && <span className="muted"> — {d.descripcion}</span>}
              {d.epc && d.numero_patrimonial && (
                <span className="muted mono"> · {d.epc}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function groupDetalles(detalles: DetalleInventario[]) {
  return {
    encontrados: detalles.filter((d) => d.estado === "encontrado"),
    faltantes: detalles.filter((d) => d.estado === "faltante" || d.estado === "esperado"),
    sobrantes: detalles.filter((d) => d.estado === "sobrante"),
  };
}

export default function InventariosPage() {
  const toast = useToast();
  const perms = usePermissions();
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [lista, setLista] = useState<InventarioListItem[]>([]);
  const [activo, setActivo] = useState<Inventario | null>(null);
  const [reporte, setReporte] = useState<InventarioReporte | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [soloDiscrepancias, setSoloDiscrepancias] = useState(false);
  const [soloPendienteAuditoria, setSoloPendienteAuditoria] = useState(false);
  const [comentario, setComentario] = useState("");

  useEffect(() => {
    const flag = sessionStorage.getItem("dn_inv_filter");
    if (flag === "discrepancias") {
      setSoloDiscrepancias(true);
      sessionStorage.removeItem("dn_inv_filter");
    }
  }, []);

  const nombreDeposito = useCallback(
    (id: string) => depositos.find((d) => d.id === id)?.nombre ?? id.slice(0, 8),
    [depositos],
  );

  const filterOpts = useMemo(
    () => ({ search, estado: estadoFilter, soloDiscrepancias, soloPendienteAuditoria }),
    [search, estadoFilter, soloDiscrepancias, soloPendienteAuditoria],
  );
  const filtersActive = hasActiveInventariosFilters(filterOpts);
  const listaFiltrada = useMemo(
    () => filterInventarios(lista, filterOpts, nombreDeposito),
    [lista, filterOpts, nombreDeposito],
  );

  const clearFilters = () => {
    setSearch("");
    setEstadoFilter("");
    setSoloDiscrepancias(false);
    setSoloPendienteAuditoria(false);
  };

  const depositoNombre = useMemo(() => {
    if (!activo) return "";
    return depositos.find((d) => d.id === activo.deposito_id)?.nombre ?? activo.deposito_id;
  }, [depositos, activo]);

  const loadLista = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deps, items] = await Promise.all([
        apiFetch<Deposito[]>("/depositos"),
        apiFetch<InventarioListItem[]>("/inventarios?limit=50"),
      ]);
      setDepositos(deps.filter((d) => d.activo));
      setLista(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar inventarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLista();
  }, [loadLista]);

  const handleAbrir = async (id: string) => {
    setBusy(true);
    setError(null);
    setReporte(null);
    try {
      const inv = await apiFetch<Inventario>(`/inventarios/${id}`);
      setActivo(inv);
      setComentario(inv.comentario_auditoria ?? "");
      if (inv.estado === "cerrado") {
        const rep = await apiFetch<InventarioReporte>(`/inventarios/${id}/reporte`);
        setReporte(rep);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al abrir inventario");
    } finally {
      setBusy(false);
    }
  };

  const syncListaItem = (inv: Inventario) => {
    setLista((prev) =>
      prev.map((item) =>
        item.id === inv.id
          ? {
              ...item,
              auditado: inv.auditado,
              auditado_en: inv.auditado_en,
              auditado_por_id: inv.auditado_por_id,
              comentario_auditoria: inv.comentario_auditoria,
            }
          : item,
      ),
    );
  };

  const handleMarcarAuditada = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!activo || activo.estado !== "cerrado") return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Inventario>(`/inventarios/${activo.id}/auditar`, {
        method: "POST",
        body: JSON.stringify({
          auditado: true,
          comentario: comentario.trim() || null,
        }),
      });
      setActivo(updated);
      setComentario(updated.comentario_auditoria ?? "");
      syncListaItem(updated);
      toast.success("Inventario marcado como auditado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al marcar auditoría");
    } finally {
      setBusy(false);
    }
  };

  const handleQuitarAuditoria = async () => {
    if (!activo || activo.estado !== "cerrado") return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Inventario>(`/inventarios/${activo.id}/auditar`, {
        method: "POST",
        body: JSON.stringify({
          auditado: false,
          comentario: comentario.trim() || null,
        }),
      });
      setActivo(updated);
      setComentario(updated.comentario_auditoria ?? "");
      syncListaItem(updated);
      toast.success("Auditoría revertida a pendiente");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al revertir auditoría");
    } finally {
      setBusy(false);
    }
  };

  const avance =
    activo && activo.resumen.total_esperado > 0
      ? Math.round((activo.resumen.total_encontrado / activo.resumen.total_esperado) * 100)
      : null;

  const detalleGrupos = activo ? groupDetalles(activo.detalles) : null;

  return (
    <div className="page">
      <PageHeader
        title="Inventarios"
        subtitle="Auditoría de conteos realizados con la APK en el MC33"
      >
        <button type="button" className="btn secondary" onClick={loadLista} disabled={loading || busy}>
          Actualizar
        </button>
      </PageHeader>

      <p className="info-banner" role="note">
        El alta, las lecturas RFID y el cierre se hacen solo desde la APK en el MC33. Acá revisás el
        reporte, marcás la sesión como auditada/vista y corregida, y exportás.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <Modal
        open={Boolean(activo)}
        title={`Inventario · ${depositoNombre}`}
        size="xl"
        onClose={() => {
          setActivo(null);
          setReporte(null);
          setComentario("");
        }}
        footer={
          activo ? (
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => handleAbrir(activo.id)}
            >
              {busy ? "Actualizando…" : "Refrescar"}
            </button>
          ) : null
        }
      >
        {activo && (
          <>
            <div className="section-header">
              <div className="section-header-right">
                <span className={`badge ${activo.estado === "cerrado" ? "ok" : "warn"}`}>
                  {estadoInventario(activo.estado)}
                </span>
                {activo.estado === "cerrado" && (
                  <span className={`badge ${activo.auditado ? "ok" : "warn"}`}>
                    {activo.auditado ? "Auditada" : "Pendiente auditoría"}
                  </span>
                )}
                {activo.estado === "cerrado" && (
                  <ExportButtons
                    basePath={`/reportes/inventarios/${activo.id}`}
                    filenameBase={`inventario_${activo.id.slice(0, 8)}`}
                    formats={["xlsx", "csv", "pdf"]}
                  />
                )}
              </div>
            </div>
            <p className="muted">
              <span className="mono">ID {activo.id}</span>
              {" · "}
              Inicio {new Date(activo.iniciado_en).toLocaleString("es-AR")}
              {activo.cerrado_en && (
                <>
                  {" · "}
                  Cierre {new Date(activo.cerrado_en).toLocaleString("es-AR")}
                </>
              )}
              {activo.auditado && activo.auditado_en && (
                <>
                  {" · "}
                  Auditada {new Date(activo.auditado_en).toLocaleString("es-AR")}
                </>
              )}
            </p>

            <div className="status-grid inventario-metrics">
              <div className="status-item">
                <span className="status-label">Esperado</span>
                <strong>{activo.resumen.total_esperado}</strong>
              </div>
              <div className="status-item tone-ok">
                <span className="status-label">Encontrado</span>
                <strong>{activo.resumen.total_encontrado}</strong>
              </div>
              <div
                className={`status-item ${activo.resumen.total_faltante > 0 ? "tone-danger" : ""}`}
              >
                <span className="status-label">Faltante</span>
                <strong>{activo.resumen.total_faltante}</strong>
              </div>
              <div
                className={`status-item ${activo.resumen.total_sobrante > 0 ? "tone-warn" : ""}`}
              >
                <span className="status-label">Sobrante</span>
                <strong>{activo.resumen.total_sobrante}</strong>
              </div>
            </div>

            {activo.estado === "en_curso" && (
              <p className="muted">
                Conteo en curso en el MC33
                {avance !== null ? ` · avance aprox. ${avance}%` : ""}.
                Actualizá para ver lecturas nuevas sincronizadas.
              </p>
            )}

            {reporte ? (
              <div className="reporte-panel">
                <h3>Reporte de auditoría</h3>
                <p>
                  Coincidencia <strong>{reporte.coincidencia_pct.toFixed(1)}%</strong>
                  {reporte.tiene_discrepancias ? " · hay discrepancias" : " · sin discrepancias"}
                </p>
                <DetalleList title="Faltantes" items={reporte.faltantes} tone="danger" />
                <DetalleList title="Sobrantes" items={reporte.sobrantes} tone="warn" />
                <DetalleList title="Encontrados" items={reporte.encontrados} tone="ok" />
              </div>
            ) : (
              detalleGrupos && (
                <div className="reporte-panel">
                  <h3>Detalle parcial</h3>
                  <DetalleList title="Encontrados" items={detalleGrupos.encontrados} tone="ok" />
                  <DetalleList
                    title="Pendientes / faltantes"
                    items={detalleGrupos.faltantes}
                    tone="danger"
                  />
                  <DetalleList title="Sobrantes" items={detalleGrupos.sobrantes} tone="warn" />
                </div>
              )
            )}

            {activo.estado === "cerrado" && perms.canAuditInventory && (
              <form
                className="inset-block"
                onSubmit={handleMarcarAuditada}
                aria-label="Marcar auditoría"
              >
                <div className="section-header">
                  <h3>{activo.auditado ? "Registro de auditoría" : "Marcar como auditada"}</h3>
                </div>
                <p className="muted">
                  Indicá que revisaste el reporte
                  {reporte?.tiene_discrepancias ? " y las discrepancias" : ""}. El comentario es
                  opcional.
                </p>
                <label className="field">
                  <span>Comentario</span>
                  <textarea
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder="Ej.: faltantes localizados / sobrante descartado / visto OK"
                    rows={3}
                    maxLength={2000}
                  />
                </label>
                <div className="form-actions">
                  {!activo.auditado ? (
                    <button type="submit" className="btn primary" disabled={busy}>
                      {busy ? "Guardando…" : "Marcar como auditada"}
                    </button>
                  ) : (
                    <>
                      <button type="submit" className="btn primary" disabled={busy}>
                        {busy ? "Guardando…" : "Actualizar comentario"}
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busy}
                        onClick={handleQuitarAuditoria}
                      >
                        Volver a pendiente
                      </button>
                    </>
                  )}
                </div>
              </form>
            )}

            {activo.estado === "cerrado" &&
              activo.auditado &&
              activo.comentario_auditoria &&
              !perms.canAuditInventory && (
                <div className="inset-block">
                  <h3>Comentario de auditoría</h3>
                  <p>{activo.comentario_auditoria}</p>
                </div>
              )}
          </>
        )}
      </Modal>

      <section className="card">
        <div className="section-header">
          <h3>Sesiones</h3>
          <span className="muted">
            {listaFiltrada.length}
            {filtersActive ? ` / ${lista.length}` : ""} registro
            {listaFiltrada.length === 1 ? "" : "s"}
          </span>
        </div>

        {lista.length > 0 && (
          <div className="toolbar" role="search" aria-label="Filtrar inventarios">
            <label className="field toolbar-field grow">
              <span>Buscar</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Depósito, estado o auditoría"
              />
            </label>
            <label className="field toolbar-field">
              <span>Estado</span>
              <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)}>
                <option value="">Todos</option>
                <option value="en_curso">En curso</option>
                <option value="cerrado">Cerrado</option>
              </select>
            </label>
            <label className="field toolbar-field checkbox-field toolbar-check">
              <input
                type="checkbox"
                checked={soloDiscrepancias}
                onChange={(e) => setSoloDiscrepancias(e.target.checked)}
              />
              <span>Solo discrepancias</span>
            </label>
            <label className="field toolbar-field checkbox-field toolbar-check">
              <input
                type="checkbox"
                checked={soloPendienteAuditoria}
                onChange={(e) => setSoloPendienteAuditoria(e.target.checked)}
              />
              <span>Pendiente auditoría</span>
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

        {loading ? (
          <p className="muted" aria-busy="true">
            Cargando…
          </p>
        ) : lista.length === 0 ? (
          <EmptyState
            title="Sin inventarios para auditar"
            description="Los conteos se inician y cierran solo desde la APK en el MC33."
            steps={[
              "En el MC33 elegí depósito e iniciá el inventario",
              "Registrá lecturas RFID con el gatillo",
              "Cerrá el conteo en la APK y auditá el reporte acá",
            ]}
          />
        ) : listaFiltrada.length === 0 ? (
          <EmptyState
            title="Sin coincidencias"
            description="Ninguna sesión coincide con los filtros actuales."
            action={
              <button type="button" className="btn secondary btn-sm" onClick={clearFilters}>
                Limpiar filtros
              </button>
            }
          />
        ) : (
          <div className="table-wrap table-panel">
            <table className="data-table dense sticky-head">
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Depósito</th>
                  <th>Estado</th>
                  <th>Auditoría</th>
                  <th className="num">Esp</th>
                  <th className="num">OK</th>
                  <th className="num">Falt</th>
                  <th className="num">Sobr</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((item) => {
                  const hasDisc = item.total_faltante > 0 || item.total_sobrante > 0;
                  return (
                    <tr
                      key={item.id}
                      className={[
                        activo?.id === item.id ? "row-active" : "",
                        hasDisc && item.estado === "cerrado" && !item.auditado ? "row-disc" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td>{new Date(item.iniciado_en).toLocaleString("es-AR")}</td>
                      <td>{nombreDeposito(item.deposito_id)}</td>
                      <td>
                        <span className={`badge ${item.estado === "cerrado" ? "ok" : "warn"}`}>
                          {estadoInventario(item.estado)}
                        </span>
                      </td>
                      <td>
                        {item.estado !== "cerrado" ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className={`badge ${item.auditado ? "ok" : "warn"}`}>
                            {item.auditado ? "Auditada" : "Pendiente"}
                          </span>
                        )}
                      </td>
                      <td className="num">{item.total_esperado}</td>
                      <td className="num">{item.total_encontrado}</td>
                      <td className={`num ${item.total_faltante > 0 ? "text-danger" : ""}`}>
                        {item.total_faltante}
                      </td>
                      <td className={`num ${item.total_sobrante > 0 ? "text-warn" : ""}`}>
                        {item.total_sobrante}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn secondary btn-sm"
                          onClick={() => handleAbrir(item.id)}
                          disabled={busy}
                        >
                          Auditar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
