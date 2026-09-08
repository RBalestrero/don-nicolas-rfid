import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import type {
  Deposito,
  DetalleInventario,
  Inventario,
  InventarioCreatePayload,
  InventarioListItem,
  InventarioReporte,
} from "../types";
import PageHeader from "./PageHeader";
import ExportButtons from "./ExportButtons";
import EmptyState from "./EmptyState";
import Stepper from "./Stepper";
import { useToast } from "../context/ToastContext";

function parseEpcs(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toUpperCase())
    .filter((e) => e.length > 0);
}

function estadoInventario(estado: string): string {
  if (estado === "en_curso") return "En curso";
  if (estado === "cerrado") return "Cerrado";
  return estado;
}

function DetalleList({ title, items }: { title: string; items: DetalleInventario[] }) {
  return (
    <div className="reporte-block">
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

export default function InventariosPage() {
  const toast = useToast();
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [lista, setLista] = useState<InventarioListItem[]>([]);
  const [depositoId, setDepositoId] = useState("");
  const [activo, setActivo] = useState<Inventario | null>(null);
  const [reporte, setReporte] = useState<InventarioReporte | null>(null);
  const [epcsText, setEpcsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(true);

  const depositoNombre = useMemo(() => {
    const id = activo?.deposito_id ?? depositoId;
    return depositos.find((d) => d.id === id)?.nombre ?? id;
  }, [depositos, activo, depositoId]);

  const loadDepositosYLista = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const deps = await apiFetch<Deposito[]>("/depositos");
      const activos = deps.filter((d) => d.activo);
      setDepositos(activos);
      setDepositoId((current) => current || activos[0]?.id || "");
      const items = await apiFetch<InventarioListItem[]>("/inventarios?limit=30");
      setLista(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar inventarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDepositosYLista();
  }, [loadDepositosYLista]);

  useEffect(() => {
    if (activo) setShowCreate(false);
  }, [activo?.id]);

  const refreshLista = async () => {
    const items = await apiFetch<InventarioListItem[]>("/inventarios?limit=30");
    setLista(items);
  };

  const handleCrear = async (e: FormEvent) => {
    e.preventDefault();
    if (!depositoId) {
      setError("Seleccioná un depósito");
      return;
    }
    setBusy(true);
    setError(null);
    setReporte(null);
    try {
      const payload: InventarioCreatePayload = { deposito_id: depositoId };
      const created = await apiFetch<Inventario>("/inventarios", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setActivo(created);
      setEpcsText("");
      setShowCreate(false);
      toast.success("Inventario iniciado");
      await refreshLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear inventario");
    } finally {
      setBusy(false);
    }
  };

  const handleAbrir = async (id: string) => {
    setBusy(true);
    setError(null);
    setReporte(null);
    try {
      const inv = await apiFetch<Inventario>(`/inventarios/${id}`);
      setActivo(inv);
      setEpcsText("");
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

  const handleRegistrarLecturas = async () => {
    if (!activo) return;
    const epcs = parseEpcs(epcsText);
    if (epcs.length === 0) {
      setError("Pegá al menos un EPC");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Inventario>(`/inventarios/${activo.id}/lecturas`, {
        method: "POST",
        body: JSON.stringify({ epcs }),
      });
      setActivo(updated);
      setEpcsText("");
      toast.success(`Lecturas registradas (${epcs.length})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar lecturas");
    } finally {
      setBusy(false);
    }
  };

  const handleCerrar = async () => {
    if (!activo) return;
    setBusy(true);
    setError(null);
    try {
      const epcs = parseEpcs(epcsText);
      const closed = await apiFetch<Inventario>(`/inventarios/${activo.id}/cerrar`, {
        method: "POST",
        body: JSON.stringify({ epcs }),
      });
      setActivo(closed);
      const rep = await apiFetch<InventarioReporte>(`/inventarios/${closed.id}/reporte`);
      setReporte(rep);
      toast.success(
        rep.tiene_discrepancias
          ? `Inventario cerrado · ${rep.coincidencia_pct.toFixed(0)}% coincidencia`
          : "Inventario cerrado sin discrepancias",
      );
      await refreshLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cerrar inventario");
    } finally {
      setBusy(false);
    }
  };

  const esperados = (activo?.detalles ?? []).filter(
    (d) => d.estado === "esperado" || d.estado === "faltante" || d.estado === "encontrado",
  );
  const stepIndex = !activo ? 0 : activo.estado === "en_curso" ? 1 : 2;

  return (
    <div className="page">
      <PageHeader
        title="Inventarios"
        subtitle="Conteo cíclico por depósito · pegá EPCs o leé RFID"
      >
        <button type="button" className="btn primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancelar" : "+ Nuevo conteo"}
        </button>
      </PageHeader>

      <Stepper
        steps={[
          { id: "iniciar", label: "Iniciar" },
          { id: "lecturas", label: "Lecturas" },
          { id: "cerrar", label: "Cerrar / reporte" },
        ]}
        current={stepIndex}
      />

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {showCreate && (
        <section className="card panel-focus">
          <h3>Nuevo conteo</h3>
          <form className="form inline-form" onSubmit={handleCrear}>
            <label className="field">
              Depósito
              <select
                value={depositoId}
                onChange={(e) => setDepositoId(e.target.value)}
                disabled={loading || busy}
                aria-label="Depósito para inventario"
              >
                <option value="">Seleccioná un depósito</option>
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={busy || !depositoId}>
                {busy ? "Creando…" : "Iniciar inventario"}
              </button>
            </div>
          </form>
        </section>
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
          <p className="muted mono">ID {activo.id}</p>
          <div className="status-grid inventario-metrics">
            <div className="status-item">
              <span className="status-label">Esperado</span>
              <strong>{activo.resumen.total_esperado}</strong>
            </div>
            <div className="status-item">
              <span className="status-label">Encontrado</span>
              <strong>{activo.resumen.total_encontrado}</strong>
            </div>
            <div className="status-item">
              <span className="status-label">Faltante</span>
              <strong>{activo.resumen.total_faltante}</strong>
            </div>
            <div className="status-item">
              <span className="status-label">Sobrante</span>
              <strong>{activo.resumen.total_sobrante}</strong>
            </div>
          </div>

          {activo.estado === "en_curso" && (
            <>
              <label className="field">
                EPCs leídos (uno por línea, o separados por coma)
                <textarea
                  value={epcsText}
                  onChange={(e) => setEpcsText(e.target.value)}
                  rows={5}
                  placeholder={"E280117000000211D6A6B53D\nE280..."}
                  disabled={busy}
                  aria-label="EPCs leídos"
                />
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleRegistrarLecturas}
                  disabled={busy}
                >
                  Registrar lecturas
                </button>
                <button type="button" className="btn primary" onClick={handleCerrar} disabled={busy}>
                  Cerrar inventario
                </button>
              </div>
              <p className="muted">
                Esperados con EPC: {esperados.filter((d) => d.epc).length}
              </p>
            </>
          )}

          {reporte && (
            <div className="reporte-panel">
              <h3>Reporte</h3>
              <p>
                Coincidencia <strong>{reporte.coincidencia_pct.toFixed(1)}%</strong>
                {reporte.tiene_discrepancias ? " · hay discrepancias" : " · sin discrepancias"}
              </p>
              <DetalleList title="Faltantes" items={reporte.faltantes} />
              <DetalleList title="Sobrantes" items={reporte.sobrantes} />
              <DetalleList title="Encontrados" items={reporte.encontrados} />
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h3>Sesiones</h3>
        {loading ? (
          <p className="muted" aria-busy="true">
            Cargando…
          </p>
        ) : lista.length === 0 ? (
          <EmptyState
            title="Sin inventarios"
            description="Iniciá un conteo para comparar stock esperado vs leído."
            action={
              <button type="button" className="btn primary btn-sm" onClick={() => setShowCreate(true)}>
                + Nuevo conteo
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table dense">
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Estado</th>
                  <th>Esp</th>
                  <th>OK</th>
                  <th>Falt</th>
                  <th>Sobr</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((item) => (
                  <tr key={item.id} className={activo?.id === item.id ? "row-active" : undefined}>
                    <td>{new Date(item.iniciado_en).toLocaleString("es-AR")}</td>
                    <td>
                      <span className={`badge ${item.estado === "cerrado" ? "ok" : "warn"}`}>
                        {estadoInventario(item.estado)}
                      </span>
                    </td>
                    <td>{item.total_esperado}</td>
                    <td>{item.total_encontrado}</td>
                    <td>{item.total_faltante}</td>
                    <td>{item.total_sobrante}</td>
                    <td>
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        onClick={() => handleAbrir(item.id)}
                        disabled={busy}
                      >
                        Abrir
                      </button>
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
