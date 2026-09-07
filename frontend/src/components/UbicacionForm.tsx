import { FormEvent, useState } from "react";
import type { Sector, UbicacionCreatePayload } from "../types";

interface UbicacionFormProps {
  sectores: Sector[];
  onSubmit: (sectorId: string, data: UbicacionCreatePayload) => Promise<void>;
}

export default function UbicacionForm({ sectores, onSubmit }: UbicacionFormProps) {
  const [sectorId, setSectorId] = useState(sectores[0]?.id ?? "");
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setCodigo("");
      setDescripcion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear ubicación");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit} aria-label="Formulario de ubicación">
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
      <button
        type="submit"
        className="btn primary"
        disabled={submitting || sectores.length === 0}
      >
        {submitting ? "Guardando..." : "Crear ubicación"}
      </button>
    </form>
  );
}
