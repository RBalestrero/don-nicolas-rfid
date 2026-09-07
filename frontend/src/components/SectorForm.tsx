import { FormEvent, useState } from "react";
import type { SectorCreatePayload } from "../types";

interface SectorFormProps {
  onSubmit: (data: SectorCreatePayload) => Promise<void>;
}

export default function SectorForm({ onSubmit }: SectorFormProps) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
      });
      setNombre("");
      setDescripcion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear sector");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit} aria-label="Formulario de sector">
      <label className="field">
        <span>Nombre del sector</span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          maxLength={100}
          placeholder="Ej: Sector A"
        />
      </label>
      <label className="field">
        <span>Descripción (opcional)</span>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Electrónica y cómputo"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn primary" disabled={submitting}>
        {submitting ? "Guardando..." : "Crear sector"}
      </button>
    </form>
  );
}
