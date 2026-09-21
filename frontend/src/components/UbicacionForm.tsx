import { FormEvent, useEffect, useState } from "react";
import type { Sector, Ubicacion, UbicacionCreatePayload } from "../types";

interface UbicacionFormProps {
  sectores: Sector[];
  initial?: Ubicacion | null;
  /** Si se edita, el sector queda fijo. */
  fixedSectorId?: string | null;
  onSubmit: (sectorId: string, data: UbicacionCreatePayload) => Promise<void>;
  onCancel?: () => void;
}

export default function UbicacionForm({
  sectores,
  initial = null,
  fixedSectorId = null,
  onSubmit,
  onCancel,
}: UbicacionFormProps) {
  const editing = Boolean(initial);
  const [sectorId, setSectorId] = useState(
    fixedSectorId ?? initial?.sector_id ?? sectores[0]?.id ?? "",
  );
  const [codigo, setCodigo] = useState(initial?.codigo ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSectorId(fixedSectorId ?? initial?.sector_id ?? sectores[0]?.id ?? "");
    setCodigo(initial?.codigo ?? "");
    setDescripcion(initial?.descripcion ?? "");
  }, [initial, fixedSectorId, sectores]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sectorId) {
      setError("Seleccioná un sector o creá uno antes de agregar ubicaciones.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(sectorId, {
        codigo: codigo.trim(),
        descripcion: descripcion.trim() || null,
      });
      if (!editing) {
        setCodigo("");
        setDescripcion("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar ubicación");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit} aria-label="Formulario de ubicación">
      {!editing && (
        <label className="field">
          <span>Sector</span>
          <select
            value={sectorId}
            onChange={(e) => setSectorId(e.target.value)}
            required
            disabled={sectores.length === 0}
          >
            {sectores.length === 0 ? (
              <option value="">Sin sectores disponibles</option>
            ) : (
              sectores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))
            )}
          </select>
        </label>
      )}
      <label className="field">
        <span>Código</span>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          required
          maxLength={50}
          placeholder="Ej: A-01"
        />
      </label>
      <label className="field">
        <span>Descripción (opcional)</span>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Estante 1, fila superior"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button
          type="submit"
          className="btn primary"
          disabled={submitting || (!editing && sectores.length === 0)}
        >
          {submitting ? "Guardando..." : editing ? "Guardar cambios" : "Crear ubicación"}
        </button>
      </div>
    </form>
  );
}
