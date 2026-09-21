import { FormEvent, useEffect, useState } from "react";
import type { Deposito, DepositoCreatePayload } from "../types";

interface DepositoFormProps {
  initial?: Deposito | null;
  onSubmit: (data: DepositoCreatePayload) => Promise<void>;
  onCancel?: () => void;
}

export default function DepositoForm({ initial = null, onSubmit, onCancel }: DepositoFormProps) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [direccion, setDireccion] = useState(initial?.direccion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const editing = Boolean(initial);

  useEffect(() => {
    setNombre(initial?.nombre ?? "");
    setDescripcion(initial?.descripcion ?? "");
    setDireccion(initial?.direccion ?? "");
  }, [initial]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        direccion: direccion.trim() || null,
      });
      if (!editing) {
        setNombre("");
        setDescripcion("");
        setDireccion("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar depósito");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit} aria-label="Formulario de depósito">
      <label className="field">
        <span>Nombre</span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          maxLength={100}
          placeholder="Ej: Depósito Central"
        />
      </label>
      <label className="field">
        <span>Descripción (opcional)</span>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Depósito principal de la planta"
        />
      </label>
      <label className="field">
        <span>Dirección (opcional)</span>
        <input
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          maxLength={255}
          placeholder="Av. Principal 123"
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
          {submitting ? "Guardando..." : editing ? "Guardar cambios" : "Crear depósito"}
        </button>
      </div>
    </form>
  );
}
