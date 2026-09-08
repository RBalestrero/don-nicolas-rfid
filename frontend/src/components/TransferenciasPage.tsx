import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import type {
  Deposito,
  DepositoDetalle,
  StockDeposito,
  Transferencia,
  TransferenciaCreatePayload,
  TransferenciaListItem,
} from "../types";
import PageHeader from "./PageHeader";
import ExportButtons from "./ExportButtons";

function parseEpcs(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toUpperCase())
    .filter((e) => e.length > 0);
}

function estadoLabel(estado: string): string {
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

export default function TransferenciasPage() {
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [lista, setLista] = useState<TransferenciaListItem[]>([]);
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [stock, setStock] = useState<StockDeposito | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [destinoDetalle, setDestinoDetalle] = useState<DepositoDetalle | null>(null);
  const [ubicacionDestinoId, setUbicacionDestinoId] = useState("");
  const [notas, setNotas] = useState("");
  const [activa, setActiva] = useState<Transferencia | null>(null);
  const [epcsText, setEpcsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nombreDeposito = useCallback(
    (id: string) => depositos.find((d) => d.id === id)?.nombre ?? id.slice(0, 8),
    [depositos],
  );

  const ubicacionesDestino = useMemo(() => {
    if (!destinoDetalle) return [];
    return destinoDetalle.sectores.flatMap((s) =>
      s.ubicaciones
        .filter((u) => u.activo)
        .map((u) => ({
          id: u.id,
          label: `${s.nombre} / ${u.codigo}`,
        })),
    );
  }, [destinoDetalle]);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const deps = await apiFetch<Deposito[]>("/depositos");
      const activos = deps.filter((d) => d.activo);
      setDepositos(activos);
      setOrigenId((current) => current || activos[0]?.id || "");
      setDestinoId((current) => {
        if (current) return current;
        return activos[1]?.id || activos[0]?.id || "";
      });
      const items = await apiFetch<TransferenciaListItem[]>("/transferencias?limit=30");
      setLista(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar transferencias");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!origenId) {
      setStock(null);
      setSelectedIds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<StockDeposito>(`/depositos/${origenId}/stock`);
        if (!cancelled) {
          setStock(data);
          setSelectedIds([]);
        }
      } catch (err) {
        if (!cancelled) {
          setStock(null);
          setError(err instanceof Error ? err.message : "Error al cargar stock origen");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [origenId]);

  useEffect(() => {
    if (!destinoId) {
      setDestinoDetalle(null);
      setUbicacionDestinoId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<DepositoDetalle>(`/depositos/${destinoId}`);
        if (!cancelled) {
          setDestinoDetalle(data);
          const ubicaciones = data.sectores.flatMap((s) =>
            s.ubicaciones.filter((u) => u.activo),
          );
          setUbicacionDestinoId(ubicaciones[0]?.id ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setDestinoDetalle(null);
          setError(err instanceof Error ? err.message : "Error al cargar depósito destino");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [destinoId]);

  const refreshLista = async () => {
    const items = await apiFetch<TransferenciaListItem[]>("/transferencias?limit=30");
    setLista(items);
  };

  const toggleActivo = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCrear = async (e: FormEvent) => {
    e.preventDefault();
    if (!origenId || !destinoId) {
      setError("Seleccioná origen y destino");
      return;
    }
    if (origenId === destinoId) {
      setError("Origen y destino deben ser distintos");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Seleccioná al menos un activo del stock origen");
      return;
    }
    if (!ubicacionDestinoId) {
      setError("Seleccioná la ubicación de destino");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: TransferenciaCreatePayload = {
        deposito_origen_id: origenId,
        deposito_destino_id: destinoId,
        activo_ids: selectedIds,
        ubicacion_destino_id: ubicacionDestinoId,
        notas: notas.trim() || null,
      };
      const created = await apiFetch<Transferencia>("/transferencias", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setActiva(created);
      setEpcsText("");
      setSelectedIds([]);
      setNotas("");
      await refreshLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la transferencia");
    } finally {
      setBusy(false);
    }
  };

  const abrir = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<Transferencia>(`/transferencias/${id}`);
      setActiva(data);
      setEpcsText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al abrir transferencia");
    } finally {
      setBusy(false);
    }
  };

  const confirmarOrigen = async () => {
    if (!activa) return;
    const epcs = parseEpcs(epcsText);
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Transferencia>(
        `/transferencias/${activa.id}/confirmar-origen`,
        { method: "POST", body: JSON.stringify({ epcs }) },
      );
      setActiva(updated);
      setEpcsText("");
      await refreshLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al confirmar origen");
    } finally {
      setBusy(false);
    }
  };

  const confirmarDestino = async () => {
    if (!activa) return;
    const epcs = parseEpcs(epcsText);
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Transferencia>(
        `/transferencias/${activa.id}/confirmar-destino`,
        {
          method: "POST",
          body: JSON.stringify({
            epcs,
            ubicacion_destino_id: activa.ubicacion_destino_id || ubicacionDestinoId || null,
          }),
        },
      );
      setActiva(updated);
      setEpcsText("");
      await refreshLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al confirmar destino");
    } finally {
      setBusy(false);
    }
  };

  const cancelar = async () => {
    if (!activa) return;
    if (!window.confirm("¿Cancelar esta transferencia?")) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Transferencia>(`/transferencias/${activa.id}/cancelar`, {
        method: "POST",
      });
      setActiva(updated);
      await refreshLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cancelar");
    } finally {
      setBusy(false);
    }
  };

  const prefillEpcs = () => {
    if (!activa) return;
    setEpcsText(
      activa.detalles
        .map((d) => d.epc)
        .filter((e): e is string => Boolean(e))
        .join("\n"),
    );
  };

  return (
    <div className="page">
      <PageHeader
        title="Transferencias"
        subtitle="Movimiento entre depósitos con confirmación por EPC"
      />

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Cargando...</p>}

      <section className="card">
        <h3>Nueva orden</h3>
        <form className="form" onSubmit={handleCrear} aria-label="Crear transferencia">
          <div className="two-col">
            <label className="field">
              <span>Depósito origen</span>
              <select value={origenId} onChange={(e) => setOrigenId(e.target.value)} required>
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Depósito destino</span>
              <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} required>
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Ubicación destino</span>
            <select
              value={ubicacionDestinoId}
              onChange={(e) => setUbicacionDestinoId(e.target.value)}
              required
              disabled={ubicacionesDestino.length === 0}
            >
              {ubicacionesDestino.length === 0 ? (
                <option value="">Sin ubicaciones en destino</option>
              ) : (
                ubicacionesDestino.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="field">
            <span>Notas (opcional)</span>
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              maxLength={2000}
              placeholder="Motivo o referencia"
            />
          </label>

          <fieldset className="stock-picker">
            <legend>Activos en origen ({stock?.total ?? 0})</legend>
            {!stock || stock.activos.length === 0 ? (
              <p className="muted">No hay activos con ubicación en el depósito origen.</p>
            ) : (
              <ul className="simple-list checkbox-list">
                {stock.activos.map((a) => (
                  <li key={a.activo_id}>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(a.activo_id)}
                        onChange={() => toggleActivo(a.activo_id)}
                      />
                      <span>
                        <strong>{a.numero_patrimonial}</strong> — {a.descripcion}
                        {a.epc && <span className="muted mono"> · {a.epc}</span>}
                        <span className="muted">
                          {" "}
                          · {a.sector_nombre}/{a.ubicacion_codigo}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Creando..." : "Crear transferencia"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="section-header">
          <h3>Órdenes</h3>
          <ExportButtons
            basePath="/reportes/transferencias"
            filenameBase="transferencias"
            disabled={lista.length === 0}
          />
        </div>
        {lista.length === 0 ? (
          <p className="muted">Todavía no hay transferencias.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Activos</th>
                  <th>Creada</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id} className={activa?.id === t.id ? "row-active" : undefined}>
                    <td>
                      <span
                        className={`badge ${
                          t.estado === "completada"
                            ? "ok"
                            : t.estado === "cancelada"
                              ? "warn"
                              : "ok"
                        }`}
                      >
                        {estadoLabel(t.estado)}
                      </span>
                    </td>
                    <td>{nombreDeposito(t.deposito_origen_id)}</td>
                    <td>{nombreDeposito(t.deposito_destino_id)}</td>
                    <td>
                      {t.confirmados_destino}/{t.total_activos}
                    </td>
                    <td className="muted">
                      {new Date(t.creado_en).toLocaleString("es-AR")}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        onClick={() => abrir(t.id)}
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

      {activa && (
        <section className="card">
          <div className="section-header">
            <h3>Transferencia — {estadoLabel(activa.estado)}</h3>
            <ExportButtons
              basePath={`/reportes/transferencias/${activa.id}`}
              filenameBase={`transferencia_${activa.id.slice(0, 8)}`}
            />
          </div>
          <p className="muted">
            {nombreDeposito(activa.deposito_origen_id)} →{" "}
            {nombreDeposito(activa.deposito_destino_id)}
            {activa.notas ? ` · ${activa.notas}` : ""}
          </p>

          <ul className="simple-list compact-list">
            {activa.detalles.map((d) => (
              <li key={d.id}>
                <strong>{d.numero_patrimonial}</strong>
                {d.descripcion && <span className="muted"> — {d.descripcion}</span>}
                {d.epc && <span className="mono muted"> · {d.epc}</span>}
                <span className="muted">
                  {" "}
                  · origen {d.confirmado_origen ? "✓" : "○"} · destino{" "}
                  {d.confirmado_destino ? "✓" : "○"}
                </span>
              </li>
            ))}
          </ul>

          {(activa.estado === "pendiente" || activa.estado === "en_transito") && (
            <>
              <label className="field">
                <span>
                  EPCs leídos (
                  {activa.estado === "pendiente" ? "confirmar origen" : "confirmar destino"})
                </span>
                <textarea
                  value={epcsText}
                  onChange={(e) => setEpcsText(e.target.value)}
                  rows={4}
                  placeholder="Uno por línea, coma o espacio"
                />
              </label>
              <div className="form-actions">
                <button type="button" className="btn secondary" onClick={prefillEpcs}>
                  Completar con EPCs de la orden
                </button>
                {activa.estado === "pendiente" && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={confirmarOrigen}
                  >
                    Confirmar origen
                  </button>
                )}
                {activa.estado === "en_transito" && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={confirmarDestino}
                  >
                    Confirmar destino
                  </button>
                )}
                <button type="button" className="btn secondary danger" disabled={busy} onClick={cancelar}>
                  Cancelar orden
                </button>
              </div>
            </>
          )}

          <div className="form-actions">
            <button type="button" className="btn secondary" onClick={() => setActiva(null)}>
              Cerrar detalle
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
