import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
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
import {
  filterInventarios,
  hasActiveInventariosFilters,
} from "../lib/filterInventarios";

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

  const nombreDeposito = useCallback(
    (id: string) => depositos.find((d) => d.id === id)?.nombre ?? id.slice(0, 8),
    [depositos],
  );

  const filterOpts = useMemo(
    () => ({ search, estado: estadoFilter, soloDiscrepancias }),
    [search, estadoFilter, soloDiscrepancias],
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
        El alta, las lecturas RFID y el cierre se hacen solo desde la APK en el dispositivo MC33.
        Acá consultás el avance, el reporte de discrepancias y exportás para auditoría.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {activo && (
        <section className="card panel-focus">
          <div className="section-header">
            <h3>Inventario · {depositoNombre}</h3>
            <div className="section-header-right">
              <span className={`badge ${activo.estado === "cerrado" ? "ok" : "warn"}`}>
                {estadoInventario(activo.estado)}
              </span>
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

          <div className="form-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setActivo(null);
                setReporte(null);
              }}
            >
              Cerrar detalle
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
        </section>
      )}

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
                placeholder="Depósito o estado"
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
                        hasDisc && item.estado === "cerrado" ? "row-disc" : "",
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
