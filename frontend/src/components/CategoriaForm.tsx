import { FormEvent, useEffect, useState } from "react";
import type { Categoria, CategoriaCreatePayload } from "../types";

interface CategoriaFormProps {
  initial?: Categoria | null;
  onSubmit: (data: CategoriaCreatePayload) => Promise<void>;
  onCancel?: () => void;
}

export default function CategoriaForm({ initial = null, onSubmit, onCancel }: CategoriaFormProps) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const editing = Boolean(initial);

  useEffect(() => {
    setNombre(initial?.nombre ?? "");
    setDescripcion(initial?.descripcion ?? "");
  }, [initial]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
      });
      if (!editing) {
        setNombre("");
        setDescripcion("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar categoría");
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
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? "Guardando..." : editing ? "Guardar cambios" : "Crear categoría"}
        </button>
      </div>
    </form>
  );
}
