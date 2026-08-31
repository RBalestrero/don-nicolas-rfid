import { FormEvent, useState } from "react";
import type { CategoriaCreatePayload } from "../types";

interface CategoriaFormProps {
  onSubmit: (data: CategoriaCreatePayload) => Promise<void>;
}

export default function CategoriaForm({ onSubmit }: CategoriaFormProps) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      await onSubmit({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
      });
      setNombre("");
      setDescripcion("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear categoría");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit} aria-label="Formulario de categoría">
      <label className="field">
        <span>Nombre</span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          maxLength={100}
          placeholder="Ej: Informática"
        />
      </label>
      <label className="field">
        <span>Descripción (opcional)</span>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Equipos de cómputo y periféricos"
        />
      </label>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">Categoría creada correctamente.</p>}
      <button type="submit" className="btn primary" disabled={submitting}>
        {submitting ? "Guardando..." : "Crear categoría"}
      </button>
    </form>
  );
}
