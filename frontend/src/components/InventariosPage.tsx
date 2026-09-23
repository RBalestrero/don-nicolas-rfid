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
import ConfirmDialog from "./ConfirmDialog";
import ExportButtons from "./ExportButtons";
import EmptyState from "./EmptyState";
import Modal from "./Modal";
import PageHeader from "./PageHeader";
import {
  filterInventarios,
  hasActiveInventariosFilters,
} from "../lib/filterInventarios";
import { usePermissions } from "../lib/usePermissions";

function estadoInventario(estado: string): string {
  if (estado === "en_curso") return "En curso";
  if (estado === "cerrado") return "Cerrado";
  if (estado === "cancelado") return "Cancelado";
  if (estado === "descartado") return "Descartado";
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
  const porArticulo = aggregateByArticulo(items);
  return (
    <div className={`reporte-block ${tone ? `tone-${tone}` : ""}`}>
      <h4>
        {title} ({porArticulo.length} art. · {items.length} etiq.)
      </h4>
      {porArticulo.length === 0 ? (
        <p className="muted">Ninguno</p>
      ) : (
        <ul className="simple-list">
          {porArticulo.map((row) => (
            <li key={row.key}>
              <span className="mono">{row.articulo}</span>
              {row.descripcion && <span className="muted"> — {row.descripcion}</span>}
              <span className="muted"> · cant. {row.cantidad}</span>
              {row.series.length > 0 && (
                <ul className="simple-list" style={{ marginTop: 4, marginBottom: 0 }}>
                  {row.series.map((sn) => (
                    <li key={sn} className="muted" style={{ fontSize: "0.85em" }}>
                      S/N {sn}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function aggregateByArticulo(items: DetalleInventario[]) {
  const map = new Map<
    string,
    {
      key: string;
      articulo: string;
      descripcion: string | null;
      cantidad: number;
      series: string[];
    }
  >();
  for (const d of items) {
    const articulo = d.numero_patrimonial?.trim() || d.epc || "(sin id)";
    const key = d.activo_id ? `A:${d.activo_id}` : `P:${articulo.toUpperCase()}`;
    const sn = d.serie_fisica?.trim();
    const prev = map.get(key);
    if (prev) {
      prev.cantidad += 1;
      if (!prev.descripcion && d.descripcion) prev.descripcion = d.descripcion;
      if (sn) prev.series.push(sn);
    } else {
      map.set(key, {
        key,
        articulo: d.numero_patrimonial?.trim() || articulo,
        descripcion: d.descripcion ?? null,
        cantidad: 1,
        series: sn ? [sn] : [],
      });
    }
  }
  return [...map.values()].sort((a, b) => a.articulo.localeCompare(b.articulo));
}

function groupDetallesParcial(detalles: DetalleInventario[]) {
  return {
    encontrados: detalles.filter((d) => d.estado === "encontrado"),
    faltantes: detalles.filter((d) => d.estado === "faltante" || d.estado === "esperado"),
    /** Sin clasificar exceso/ajeno: eso lo define el reporte del backend al cerrar. */
    sobrantes: detalles.filter((d) => d.estado === "sobrante"),
  };
}

/** KPIs del depósito: solo lecturas esperadas (los sobrantes se avisan aparte). */
function inventoryKpis(r: {
  total_esperado: number;
  total_encontrado: number;
  total_faltante: number;
  total_sobrante: number;
}) {
  const stockAntes = r.total_esperado;
  const leidos = r.total_encontrado;
  const diferencia = leidos - stockAntes;
  return { stockAntes, leidos, diferencia };
}

function formatDiferencia(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
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
  const [confirmDescartar, setConfirmDescartar] = useState(false);
  const [confirmAuditar, setConfirmAuditar] = useState(false);

  useEffect(() => {
    const flag = sessionStorage.getItem("dn_inv_filter");
    if (flag === "discrepancias") {
      setSoloDiscrepancias(true);
      sessionStorage.removeItem("dn_inv_filter");
    } else if (flag === "pendiente_auditoria") {
      setSoloPendienteAuditoria(true);
      setEstadoFilter("cerrado");
      sessionStorage.removeItem("dn_inv_filter");
    } else if (flag === "en_curso") {
      setEstadoFilter("en_curso");
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

  const loadLista = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [deps, items] = await Promise.all([
        apiFetch<Deposito[]>("/depositos", { signal }),
        apiFetch<InventarioListItem[]>("/inventarios?limit=50", { signal }),
      ]);
      if (signal?.aborted) return;
      setDepositos(deps.filter((d) => d.activo));
      setLista(items);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : "Error al cargar inventarios");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void loadLista(ac.signal);
    return () => ac.abort();
  }, [loadLista]);

  const handleAbrir = async (id: string) => {
    setBusy(true);
    setError(null);
    setReporte(null);
    try {
      const inv = await apiFetch<Inventario>(`/inventarios/${id}`);
      setActivo(inv);
      setComentario(inv.comentario_auditoria ?? "");
      setConfirmDescartar(false);
      setConfirmAuditar(false);
      if (inv.estado === "cerrado" || inv.estado === "descartado") {
        const rep = await apiFetch<InventarioReporte>(`/inventarios/${id}/reporte`);
        setReporte(rep);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al abrir inventario";
      setError(msg);
      toast.error(msg);
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
              estado: inv.estado,
              auditado: inv.auditado,
              auditado_en: inv.auditado_en,
              auditado_por_id: inv.auditado_por_id,
              comentario_auditoria: inv.comentario_auditoria,
              ajuste_aplicado: inv.ajuste_aplicado,
            }
          : item,
      ),
    );
  };

  const handleMarcarAuditada = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!activo || activo.estado !== "cerrado") return;
    if (
      !activo.auditado &&
      !activo.ajuste_aplicado &&
      (activo.resumen.total_faltante ?? 0) > 0 &&
      !confirmAuditar
    ) {
      setConfirmAuditar(true);
      return;
    }
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
      setConfirmAuditar(false);
      toast.success(
        updated.ajuste_aplicado && (updated.resumen.total_faltante ?? 0) > 0
          ? "Auditoría confirmada: stock ajustado por faltantes"
          : "Inventario marcado como auditado",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al marcar auditoría";
      setError(msg);
      toast.error(msg);
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
      const msg = err instanceof Error ? err.message : "Error al revertir auditoría";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleDescartar = async () => {
    if (!activo || activo.estado !== "cerrado") return;
    const motivo = comentario.trim();
    if (!motivo) {
      toast.error("Indicá un comentario para descartar el inventario");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Inventario>(`/inventarios/${activo.id}/descartar`, {
        method: "POST",
        body: JSON.stringify({ comentario: motivo }),
      });
      setActivo(updated);
      setComentario(updated.comentario_auditoria ?? "");
      syncListaItem(updated);
      setConfirmDescartar(false);
      toast.success("Inventario descartado: el stock no se modificó");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al descartar inventario";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const avance =
    activo && activo.resumen.total_esperado > 0
      ? Math.round((activo.resumen.total_encontrado / activo.resumen.total_esperado) * 100)
      : null;

  const detalleGrupos = activo ? groupDetallesParcial(activo.detalles) : null;
  const kpisActivo = activo ? inventoryKpis(activo.resumen) : null;

  return (
    <div className="page">
      <PageHeader
        title="Inventarios"
        subtitle="Revisá y auditá los conteos hechos con el lector"
        leading={
          !loading && lista.length > 0 ? (
            <span>
              {listaFiltrada.length}
              {filtersActive ? ` / ${lista.length}` : ""} conteo
              {listaFiltrada.length === 1 ? "" : "s"}
            </span>
          ) : null
        }
      >
        <button
          type="button"
          className="btn secondary btn-sm"
          disabled={loading || busy}
          onClick={() => void loadLista()}
        >
          {loading ? "Cargando…" : "Actualizar"}
        </button>
      </PageHeader>

      {error && !activo && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <Modal
        open={Boolean(activo)}
        title={`Inventario · ${depositoNombre}`}
        size="xl"
        onClose={() => {
          if (busy) return;
          setActivo(null);
          setReporte(null);
          setComentario("");
          setError(null);
        }}
        closeOnEscape={!busy}
        closeOnBackdrop={!busy}
        footer={
          activo ? (
            <div className="modal-footer-actions">
              {error && (
                <p className="error modal-inline-error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                  setActivo(null);
                  setReporte(null);
                  setComentario("");
                  setError(null);
                }}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => handleAbrir(activo.id)}
              >
                {busy ? "Actualizando…" : "Refrescar"}
              </button>
            </div>
          ) : null
        }
      >
        {activo && (
          <>
            {busy && !reporte && (activo.estado === "cerrado" || activo.estado === "descartado") && (
              <p className="muted" aria-busy="true">
                Cargando reporte…
              </p>
            )}
            <div className="modal-toolbar">
                <span
                  className={`badge ${
                    activo.estado === "cerrado"
                      ? "ok"
                      : activo.estado === "descartado"
                        ? "danger"
                        : "warn"
                  }`}
                >
                  {estadoInventario(activo.estado)}
                </span>
                {activo.estado === "cerrado" && (
                  <span className={`badge ${activo.auditado ? "ok" : "warn"}`}>
                    {activo.auditado ? "Auditada" : "Pendiente auditoría"}
                  </span>
                )}
                {(activo.estado === "cerrado" || activo.estado === "descartado") && (
                  <ExportButtons
                    basePath={`/reportes/inventarios/${activo.id}`}
                    filenameBase={`inventario_${activo.id.slice(0, 8)}`}
                    formats={["xlsx", "csv", "pdf"]}
                  />
                )}
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
                  {activo.estado === "descartado" ? "Descartado" : "Auditada"}{" "}
                  {new Date(activo.auditado_en).toLocaleString("es-AR")}
                </>
              )}
            </p>

            {kpisActivo && (
              <div className="status-grid inventario-metrics">
                <div className="status-item">
                  <span className="status-label">Stock antes</span>
                  <strong>{kpisActivo.stockAntes}</strong>
                </div>
                <div className="status-item">
                  <span className="status-label">Leídos</span>
                  <strong>{kpisActivo.leidos}</strong>
                </div>
                <div
                  className={`status-item ${
                    kpisActivo.diferencia < 0
                      ? "tone-danger"
                      : kpisActivo.diferencia > 0
                        ? "tone-warn"
                        : ""
                  }`}
                >
                  <span className="status-label">Diferencia</span>
                  <strong>{formatDiferencia(kpisActivo.diferencia)}</strong>
                </div>
              </div>
            )}

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
                <DetalleList
                  title="Excesos del depósito"
                  items={reporte.excesos ?? []}
                  tone="warn"
                />
                <DetalleList title="Encontrados" items={reporte.encontrados} tone="ok" />
                {(reporte.ajenos?.length ?? 0) > 0 && (
                  <DetalleList
                    title="Etiquetas ajenas (no son discrepancia)"
                    items={reporte.ajenos ?? []}
                    tone="warn"
                  />
                )}
              </div>
            ) : (
              detalleGrupos && (
                <div className="reporte-panel">
                  <h3>Detalle parcial</h3>
                  <p className="muted">
                    La clasificación exceso/ajeno está en el reporte al cerrar el inventario en el
                    MC33.
                  </p>
                  <DetalleList title="Encontrados" items={detalleGrupos.encontrados} tone="ok" />
                  <DetalleList
                    title="Pendientes / faltantes"
                    items={detalleGrupos.faltantes}
                    tone="danger"
                  />
                  <DetalleList
                    title="Sobrantes (sin clasificar)"
                    items={detalleGrupos.sobrantes}
                    tone="warn"
                  />
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
                  <h3>{activo.auditado ? "Registro de auditoría" : "Confirmar auditoría"}</h3>
                </div>
                {!activo.auditado ? (
                  <p className="muted">
                    Confirmá el conteo si es válido
                    {reporte?.tiene_discrepancias ? " (incluye discrepancias)" : ""}.
                    {(activo.resumen.total_faltante ?? 0) > 0
                      ? " Al confirmar se ajustará el stock de los faltantes."
                      : " El comentario es opcional."}
                    {" "}Si el conteo no es válido, descartalo para no afectar el stock.
                  </p>
                ) : (
                  <p className="muted">
                    {activo.ajuste_aplicado
                      ? (activo.resumen.total_faltante ?? 0) > 0
                        ? "Auditoría confirmada y stock ajustado por faltantes. Podés actualizar el comentario."
                        : "Auditoría confirmada. Podés actualizar el comentario."
                      : "Registro de auditoría."}
                  </p>
                )}
                <label className="field">
                  <span>Comentario{!activo.auditado ? " (obligatorio para descartar)" : ""}</span>
                  <textarea
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder="Ej.: faltantes localizados / conteo inválido / visto OK"
                    rows={3}
                    maxLength={2000}
                  />
                </label>
                <div className="form-actions">
                  {!activo.auditado ? (
                    <>
                      <button type="submit" className="btn primary" disabled={busy}>
                        {busy ? "Guardando…" : "Confirmar auditoría"}
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        disabled={busy}
                        onClick={() => {
                          if (!comentario.trim()) {
                            toast.error("Indicá un comentario para descartar el inventario");
                            return;
                          }
                          setConfirmDescartar(true);
                        }}
                      >
                        Descartar inventario
                      </button>
                    </>
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

            {activo.estado === "descartado" && (
              <div className="inset-block">
                <h3>Inventario descartado</h3>
                <p className="muted">
                  Este conteo se rechazó en auditoría. El stock no se modificó.
                </p>
                {activo.comentario_auditoria && <p>{activo.comentario_auditoria}</p>}
              </div>
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

      <ConfirmDialog
        open={confirmAuditar}
        title="Confirmar auditoría"
        description={`Se ajustará el stock de ${activo?.resumen.total_faltante ?? 0} faltante(s). Esta acción no se puede deshacer.`}
        confirmLabel="Confirmar y ajustar stock"
        cancelLabel="Volver"
        danger
        busy={busy}
        onConfirm={() => {
          void handleMarcarAuditada();
        }}
        onCancel={() => setConfirmAuditar(false)}
      />

      <ConfirmDialog
        open={confirmDescartar}
        title="Descartar inventario"
        description="Se marcará el conteo como inválido y no se ajustará el stock. Esta acción no se puede deshacer."
        confirmLabel="Descartar"
        cancelLabel="Volver"
        danger
        busy={busy}
        onConfirm={() => {
          void handleDescartar();
        }}
        onCancel={() => setConfirmDescartar(false)}
      />

      <section className="card">
        {lista.length > 0 && (
          <div className="toolbar toolbar-compact" role="search" aria-label="Filtrar inventarios">
            <label className="field toolbar-field grow">
              <span className="sr-only">Buscar</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar depósito, estado…"
              />
            </label>
            <label className="field toolbar-field">
              <span className="sr-only">Estado</span>
              <select
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value)}
                aria-label="Estado"
              >
                <option value="">Estado</option>
                <option value="en_curso">En curso</option>
                <option value="cerrado">Cerrado</option>
                <option value="cancelado">Cancelado</option>
                <option value="descartado">Descartado</option>
              </select>
            </label>
            <label className="field toolbar-field checkbox-field toolbar-check">
              <input
                type="checkbox"
                checked={soloDiscrepancias}
                onChange={(e) => setSoloDiscrepancias(e.target.checked)}
              />
              <span>Discrepancias</span>
            </label>
            <label className="field toolbar-field checkbox-field toolbar-check">
              <input
                type="checkbox"
                checked={soloPendienteAuditoria}
                onChange={(e) => setSoloPendienteAuditoria(e.target.checked)}
              />
              <span>Pend. auditoría</span>
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
                  <th className="num">Antes</th>
                  <th className="num">Leídos</th>
                  <th className="num">Dif.</th>
                  <th className="col-actions">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((item) => {
                  const hasDisc = item.total_faltante > 0 || (item.total_exceso ?? 0) > 0;
                  const kpis = inventoryKpis(item);
                  const canAuditar = item.estado === "cerrado" && perms.canAuditInventory;
                  return (
                    <tr
                      key={item.id}
                      className={[
                        "row-clickable",
                        activo?.id === item.id ? "row-active" : "",
                        hasDisc && item.estado === "cerrado" && !item.auditado ? "row-disc" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => {
                        if (!busy) void handleAbrir(item.id);
                      }}
                      title={`${canAuditar ? "Auditar" : "Ver"} inventario`}
                    >
                      <td>{new Date(item.iniciado_en).toLocaleString("es-AR")}</td>
                      <td>{nombreDeposito(item.deposito_id)}</td>
                      <td>
                        <span
                          className={`badge ${
                            item.estado === "cerrado"
                              ? "ok"
                              : item.estado === "descartado"
                                ? "danger"
                                : "warn"
                          }`}
                        >
                          {estadoInventario(item.estado)}
                        </span>
                      </td>
                      <td>
                        {item.estado === "descartado" ? (
                          <span className="muted">—</span>
                        ) : item.estado !== "cerrado" ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className={`badge ${item.auditado ? "ok" : "warn"}`}>
                            {item.auditado ? "Auditada" : "Pendiente"}
                          </span>
                        )}
                      </td>
                      <td className="num">{kpis.stockAntes}</td>
                      <td className="num">{kpis.leidos}</td>
                      <td
                        className={`num ${
                          kpis.diferencia < 0
                            ? "text-danger"
                            : kpis.diferencia > 0
                              ? "text-warn"
                              : ""
                        }`}
                      >
                        {formatDiferencia(kpis.diferencia)}
                      </td>
                      <td className="col-actions">
                        <div className="row-actions">
                          <button
                            type="button"
                            className={`btn btn-sm ${canAuditar && !item.auditado ? "primary" : "secondary"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleAbrir(item.id);
                            }}
                            disabled={busy}
                          >
                            {canAuditar ? "Auditar" : "Ver"}
                          </button>
                        </div>
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
