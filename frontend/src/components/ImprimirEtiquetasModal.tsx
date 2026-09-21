import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../context/ToastContext";
import type { Activo, EtiquetaLoteResponse } from "../types";
import { usePermissions } from "../lib/usePermissions";
import Modal from "./Modal";

interface ImpresoraConfig {
  host: string;
  port: number;
  simulate: boolean;
  timeout: number;
  actualizado_en: string | null;
  fuente: string;
}

export interface ImprimirEtiquetasModalProps {
  open: boolean;
  onClose: () => void;
  activos: Activo[];
  initialActivoId?: string | null;
  onPrinted?: () => void;
}

export default function ImprimirEtiquetasModal({
  open,
  onClose,
  activos,
  initialActivoId = null,
  onPrinted,
}: ImprimirEtiquetasModalProps) {
  const toast = useToast();
  const perms = usePermissions();
  const canEditPrinter = perms.canManageUsers || perms.canManageRoles;
  const canReadPrinter =
    perms.canWriteAssets || perms.canManageUsers || perms.canManageRoles;
  const wasOpen = useRef(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activoId, setActivoId] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [modo, setModo] = useState<"nueva" | "reposicion">("nueva");
  const [seriesFisicas, setSeriesFisicas] = useState<string[]>([]);
  const [lastLote, setLastLote] = useState<EtiquetaLoteResponse | null>(null);

  const [printerHost, setPrinterHost] = useState("192.168.1.20");
  const [printerPort, setPrinterPort] = useState(9100);
  const [printerSimulate, setPrinterSimulate] = useState(true);
  const [printerTimeout, setPrinterTimeout] = useState(5);
  const [printerMeta, setPrinterMeta] = useState<{
    fuente: string;
    actualizado_en: string | null;
  } | null>(null);
  const [printerBusy, setPrinterBusy] = useState(false);
  const [printerLoading, setPrinterLoading] = useState(false);
  const [showPrinter, setShowPrinter] = useState(false);

  const loadPrinter = useCallback(
    async (signal?: AbortSignal) => {
      if (!canReadPrinter) {
        setPrinterMeta(null);
        return;
      }
      setPrinterLoading(true);
      try {
        const data = await apiFetch<ImpresoraConfig>("/config/impresora", { signal });
        if (signal?.aborted) return;
        setPrinterHost(data.host);
        setPrinterPort(data.port);
        setPrinterSimulate(data.simulate);
        setPrinterTimeout(data.timeout);
        setPrinterMeta({ fuente: data.fuente, actualizado_en: data.actualizado_en });
      } finally {
        if (!signal?.aborted) setPrinterLoading(false);
      }
    },
    [canReadPrinter],
  );

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }

    const justOpened = !wasOpen.current;
    wasOpen.current = true;

    if (!justOpened) return;

    setError(null);
    setLastLote(null);
    setCantidad(1);
    setModo("nueva");
    setSeriesFisicas([]);
    setShowPrinter(false);
    const preferred =
      initialActivoId && activos.some((a) => a.id === initialActivoId)
        ? initialActivoId
        : "";
    setActivoId(preferred);

    const ac = new AbortController();
    void loadPrinter(ac.signal).catch(() => {
      // Lectura de impresora es opcional según permisos.
    });
    return () => ac.abort();
    // Solo al abrir: no resetear al refrescar activos (p.ej. tras imprimir).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open edge
  }, [open, loadPrinter]);

  const articuloSeleccionado = useMemo(
    () => activos.find((a) => a.id === activoId) ?? null,
    [activos, activoId],
  );

  const requiereSeries =
    Boolean(articuloSeleccionado?.serializado) && modo === "nueva";

  useEffect(() => {
    if (!requiereSeries) {
      setSeriesFisicas([]);
      return;
    }
    setSeriesFisicas((prev) => {
      const next = [...prev];
      while (next.length < cantidad) next.push("");
      return next.slice(0, cantidad);
    });
  }, [requiereSeries, cantidad, activoId]);

  const submitLote = async (imprimir: boolean) => {
    if (!activoId) {
      setError("Seleccioná un artículo");
      return;
    }
    if (modo === "reposicion" && !imprimir) {
      setError("La reposición solo aplica a impresión");
      return;
    }
    if (requiereSeries) {
      const filled = seriesFisicas.map((s) => s.trim()).filter(Boolean);
      if (filled.length !== cantidad) {
        setError(`Ingresá ${cantidad} número(s) de serie de fábrica`);
        return;
      }
      const unique = new Set(filled.map((s) => s.toUpperCase()));
      if (unique.size !== filled.length) {
        setError("Hay series de fábrica duplicadas en el lote");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const path = imprimir
        ? `/activos/${activoId}/imprimir-etiquetas`
        : `/activos/${activoId}/etiquetas`;
      const body: {
        cantidad: number;
        modo: "nueva" | "reposicion";
        series_fisicas?: string[];
      } = { cantidad, modo };
      if (requiereSeries) {
        body.series_fisicas = seriesFisicas.map((s) => s.trim());
      }
      const data = await apiFetch<EtiquetaLoteResponse>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setLastLote(data);
      toast.success(
        modo === "reposicion"
          ? `${data.cantidad} etiqueta(s) reimpresas · stock ${data.stock_etiquetas}`
          : imprimir
            ? `${data.cantidad} etiqueta(s) generadas e impresas · stock ${data.stock_etiquetas}`
            : `${data.cantidad} etiqueta(s) codificadas · stock ${data.stock_etiquetas}`,
      );
      onPrinted?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al procesar etiquetas";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const onSubmitPrint = (e: FormEvent) => {
    e.preventDefault();
    void submitLote(true);
  };

  const savePrinter = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEditPrinter) return;
    setPrinterBusy(true);
    setError(null);
    try {
      const data = await apiFetch<ImpresoraConfig>("/config/impresora", {
        method: "PUT",
        body: JSON.stringify({
          host: printerHost.trim(),
          port: printerPort,
          simulate: printerSimulate,
          timeout: printerTimeout,
        }),
      });
      setPrinterHost(data.host);
      setPrinterPort(data.port);
      setPrinterSimulate(data.simulate);
      setPrinterTimeout(data.timeout);
      setPrinterMeta({ fuente: data.fuente, actualizado_en: data.actualizado_en });
      toast.success(
        data.simulate
          ? `Impresora · simulación ON · ${data.host}:${data.port}`
          : `Impresora · envío real · ${data.host}:${data.port}`,
      );
      setShowPrinter(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar impresora";
      setError(msg);
      toast.error(msg);
    } finally {
      setPrinterBusy(false);
    }
  };

  const printFormDisabled = !perms.canWriteAssets || busy;

  const handleClose = () => {
    if (busy || printerBusy) return;
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        title="Imprimir etiquetas"
        subtitle="Elegí el artículo y la cantidad de unidades"
        size="lg"
        onClose={handleClose}
        closeOnBackdrop={!busy && !printerBusy}
        closeOnEscape={!busy && !printerBusy && !showPrinter}
      >
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {canReadPrinter && (
          <div className="section-header">
            <span className="muted mono">
              {printerLoading
                ? "…"
                : `${printerSimulate ? "Simulación" : "Real"} · ${printerHost}:${printerPort}`}
            </span>
            <div className="section-header-right">
              {canEditPrinter ? (
                <button
                  type="button"
                  className="btn ghost btn-sm"
                  disabled={busy || printerBusy}
                  onClick={() => setShowPrinter(true)}
                >
                  Configurar impresora…
                </button>
              ) : (
                <span className="muted">Solo lectura</span>
              )}
            </div>
          </div>
        )}

        <form className="form" onSubmit={onSubmitPrint}>
          <div className="print-lote-fields">
            <label className="field">
              <span>Artículo (SKU / patrimonio)</span>
              <select
                value={activoId}
                onChange={(e) => setActivoId(e.target.value)}
                required
                disabled={printFormDisabled}
              >
                <option value="">Seleccionar…</option>
                {activos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.numero_patrimonial} — {a.descripcion}
                    {typeof a.stock_etiquetas === "number"
                      ? ` (stock ${a.stock_etiquetas})`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Cantidad de unidades</span>
              <input
                type="number"
                min={1}
                max={50}
                value={cantidad}
                onChange={(e) =>
                  setCantidad(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                }
                disabled={printFormDisabled}
              />
            </label>
          </div>

          <div
            className="tabs activo-detalle-modo-tabs"
            role="radiogroup"
            aria-label="Tipo de etiqueta"
          >
            <button
              type="button"
              role="radio"
              className={`tab${modo === "nueva" ? " active" : ""}`}
              aria-checked={modo === "nueva"}
              disabled={printFormDisabled}
              onClick={() => setModo("nueva")}
            >
              Nueva
            </button>
            <button
              type="button"
              role="radio"
              className={`tab${modo === "reposicion" ? " active" : ""}`}
              aria-checked={modo === "reposicion"}
              disabled={printFormDisabled}
              onClick={() => setModo("reposicion")}
            >
              Reposición
            </button>
          </div>

          {articuloSeleccionado && (
            <p className="muted form-hint">
              {modo === "nueva"
                ? articuloSeleccionado.serializado
                  ? "Artículo serializado: ingresá el Nº de serie de fábrica de cada unidad."
                  : "Cada unidad recibe un código propio."
                : "Se reimprimen etiquetas existentes sin crear EPCs nuevos."}{" "}
              Stock actual: {articuloSeleccionado.stock_etiquetas ?? 0}.
            </p>
          )}

          {requiereSeries && (
            <fieldset className="series-fisicas-fields">
              <legend>Números de serie de fábrica</legend>
              {seriesFisicas.map((serie, idx) => (
                <label key={idx} className="field">
                  <span>Serie #{idx + 1}</span>
                  <input
                    value={serie}
                    onChange={(e) => {
                      const next = [...seriesFisicas];
                      next[idx] = e.target.value;
                      setSeriesFisicas(next);
                    }}
                    required
                    maxLength={120}
                    disabled={printFormDisabled}
                    autoComplete="off"
                    placeholder="S/N de fábrica"
                  />
                </label>
              ))}
            </fieldset>
          )}

          <div className="form-actions">
            {perms.canWriteAssets ? (
              <>
                {modo === "nueva" && (
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy || !activoId}
                    onClick={() => void submitLote(false)}
                  >
                    Solo codificar
                  </button>
                )}
                <button type="submit" className="btn primary" disabled={busy || !activoId}>
                  {busy ? "Procesando…" : modo === "reposicion" ? "Reimprimir" : "Imprimir"}
                </button>
              </>
            ) : (
              <p className="muted">Tu rol no puede generar etiquetas.</p>
            )}
          </div>
        </form>

        {lastLote && (
          <div className="lote-result">
            <h3>
              Último lote · {lastLote.numero_patrimonial} · {lastLote.cantidad} u. · stock{" "}
              {lastLote.stock_etiquetas}
            </h3>
            <div className="table-wrap table-panel">
              <table className="data-table dense sticky-head">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Artículo</th>
                    <th>Serial EPC</th>
                    <th>Serie fábrica</th>
                  </tr>
                </thead>
                <tbody>
                  {lastLote.etiquetas.map((e) => (
                    <tr key={e.id}>
                      <td className="mono">{e.epc}</td>
                      <td>{e.decodificado.articulo_sugerido ?? "—"}</td>
                      <td className="mono">{e.serial_hex ?? "—"}</td>
                      <td className="mono">{e.serie_fisica ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={open && showPrinter && canEditPrinter}
        title="Conexión impresora"
        subtitle={
          printerMeta?.actualizado_en
            ? `Actualizado ${new Date(printerMeta.actualizado_en).toLocaleString("es-AR")}`
            : "Host y puerto de red"
        }
        size="sm"
        onClose={() => {
          if (printerBusy) return;
          setShowPrinter(false);
        }}
        closeOnBackdrop={!printerBusy}
        closeOnEscape={!printerBusy}
        footer={
          <div className="modal-footer-actions">
            <button
              type="button"
              className="btn secondary"
              disabled={printerBusy}
              onClick={() => setShowPrinter(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-impresora-modal"
              className="btn primary"
              disabled={printerBusy}
            >
              {printerBusy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        }
      >
        <form id="form-impresora-modal" className="form" onSubmit={savePrinter}>
          <label className="field">
            <span>IP / host</span>
            <input
              value={printerHost}
              onChange={(e) => setPrinterHost(e.target.value)}
              placeholder="192.168.1.20"
              required
              disabled={printerBusy}
              autoComplete="off"
            />
          </label>
          <div className="two-col">
            <label className="field">
              <span>Puerto</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={printerPort}
                onChange={(e) => setPrinterPort(Number(e.target.value) || 9100)}
                required
                disabled={printerBusy}
              />
            </label>
            <label className="field">
              <span>Timeout (s)</span>
              <input
                type="number"
                min={1}
                max={60}
                value={printerTimeout}
                onChange={(e) => setPrinterTimeout(Number(e.target.value) || 5)}
                required
                disabled={printerBusy}
              />
            </label>
          </div>
          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={printerSimulate}
              onChange={(e) => setPrinterSimulate(e.target.checked)}
              disabled={printerBusy}
            />
            <span>Modo simulación (no enviar a la impresora)</span>
          </label>
        </form>
      </Modal>
    </>
  );
}
