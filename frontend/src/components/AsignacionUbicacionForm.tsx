import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import type {
  AsignacionUbicacionPayload,
  Deposito,
  DepositoDetalle,
  SectorDetalle,
  Ubicacion,
} from "../types";

interface AsignacionUbicacionFormProps {
  onSubmit: (data: AsignacionUbicacionPayload) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export default function AsignacionUbicacionForm({
  onSubmit,
  onCancel,
  submitLabel = "Asignar ubicación",
}: AsignacionUbicacionFormProps) {
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [detalle, setDetalle] = useState<DepositoDetalle | null>(null);
  const [depositoId, setDepositoId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [ubicacionId, setUbicacionId] = useState("");
  const [loadingDepositos, setLoadingDepositos] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingDepositos(true);
      setError(null);
      try {
        const data = await apiFetch<Deposito[]>("/depositos");
        if (cancelled) return;
        setDepositos(data.filter((d) => d.activo));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al cargar depósitos");
        }
      } finally {
        if (!cancelled) setLoadingDepositos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!depositoId) {
      setDetalle(null);
      setSectorId("");
      setUbicacionId("");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingTree(true);
      setError(null);
      setSectorId("");
      setUbicacionId("");
      try {
        const tree = await apiFetch<DepositoDetalle>(
          `/depositos/${depositoId}?include_tree=true`,
        );
        if (cancelled) return;
        setDetalle(tree);
      } catch (err) {
        if (!cancelled) {
          setDetalle(null);
          setError(err instanceof Error ? err.message : "Error al cargar estructura");
        }
      } finally {
        if (!cancelled) setLoadingTree(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [depositoId]);

  const sectores: SectorDetalle[] = useMemo(
    () => (detalle?.sectores ?? []).filter((s) => s.activo),
    [detalle],
  );

  const ubicaciones: Ubicacion[] = useMemo(() => {
    const sector = sectores.find((s) => s.id === sectorId);
    return (sector?.ubicaciones ?? []).filter((u) => u.activo);
  }, [sectores, sectorId]);

  useEffect(() => {
    setUbicacionId("");
  }, [sectorId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!ubicacionId) {
      setError("Seleccioná depósito, sector y ubicación.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ ubicacion_id: ubicacionId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al asignar ubicación");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="form asignacion-form"
      onSubmit={handleSubmit}
      aria-label="Formulario de asignación de ubicación"
    >
      <label className="field">
        Depósito
        <select
          value={depositoId}
          onChange={(e) => setDepositoId(e.target.value)}
          disabled={loadingDepositos || submitting}
          required
          aria-label="Depósito"
        >
          <option value="">
            {loadingDepositos ? "Cargando…" : "Seleccioná un depósito"}
          </option>
          {depositos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Sector
        <select
          value={sectorId}
          onChange={(e) => setSectorId(e.target.value)}
          disabled={!depositoId || loadingTree || submitting}
          required
          aria-label="Sector"
        >
          <option value="">
            {loadingTree ? "Cargando…" : "Seleccioná un sector"}
          </option>
          {sectores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Ubicación
        <select
          value={ubicacionId}
          onChange={(e) => setUbicacionId(e.target.value)}
          disabled={!sectorId || submitting}
          required
          aria-label="Ubicación"
        >
          <option value="">Seleccioná una ubicación</option>
          {ubicaciones.map((u) => (
            <option key={u.id} value={u.id}>
              {u.codigo}
              {u.descripcion ? ` — ${u.descripcion}` : ""}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button
          type="submit"
          className="btn primary"
          disabled={submitting || !ubicacionId}
        >
          {submitting ? "Asignando…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            className="btn secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
