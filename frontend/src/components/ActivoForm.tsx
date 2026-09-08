import { FormEvent, useEffect, useState } from "react";
import type { Activo, ActivoCreatePayload, Categoria } from "../types";

interface ActivoFormProps {
  categorias: Categoria[];
  onSubmit: (data: ActivoCreatePayload) => Promise<void>;
  onCancel?: () => void;
  initial?: Activo | null;
  submitLabel?: string;
}

export default function ActivoForm({
  categorias,
  onSubmit,
  onCancel,
  initial = null,
  submitLabel,
}: ActivoFormProps) {
  const [numeroPatrimonial, setNumeroPatrimonial] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? "");
  const [epc, setEpc] = useState("");
  const [datosTecnicos, setDatosTecnicos] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initial) {
      setNumeroPatrimonial("");
      setDescripcion("");
      setCategoriaId(categorias[0]?.id ?? "");
      setEpc("");
      setDatosTecnicos("");
      return;
    }
    setNumeroPatrimonial(initial.numero_patrimonial);
    setDescripcion(initial.descripcion);
    setCategoriaId(initial.categoria_id);
    setEpc(initial.epc ?? "");
    setDatosTecnicos(
      initial.datos_tecnicos ? JSON.stringify(initial.datos_tecnicos, null, 2) : "",
    );
  }, [initial, categorias]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!categoriaId) {
      setError("Seleccioná una categoría o creá una antes de dar de alta un activo.");
      return;
    }

    let parsedDatos: Record<string, unknown> | null = null;
    if (datosTecnicos.trim()) {
      try {
        parsedDatos = JSON.parse(datosTecnicos) as Record<string, unknown>;
      } catch {
        setError("Los datos técnicos deben ser JSON válido.");
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        numero_patrimonial: numeroPatrimonial.trim(),
        descripcion: descripcion.trim(),
        categoria_id: categoriaId,
        epc: epc.trim() || null,
        datos_tecnicos: parsedDatos,
      });
      if (!initial) {
        setNumeroPatrimonial("");
        setDescripcion("");
        setEpc("");
        setDatosTecnicos("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el activo");
    } finally {
      setSubmitting(false);
    }
  };

  const buttonLabel =
    submitLabel ?? (initial ? "Guardar cambios" : "Dar de alta activo");

  return (
    <form
      className="form"
      onSubmit={handleSubmit}
      aria-label={initial ? "Formulario de edición de activo" : "Formulario de alta de activo"}
    >
      <label className="field">
        <span>Número patrimonial</span>
        <input
          value={numeroPatrimonial}
          onChange={(e) => setNumeroPatrimonial(e.target.value)}
          required
          maxLength={50}
          placeholder="Ej: PAT-2024-001"
        />
      </label>

      <label className="field">
        <span>Descripción</span>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          required
          maxLength={255}
          placeholder="Ej: Notebook Dell Latitude 5540"
        />
      </label>

      <label className="field">
        <span>Categoría</span>
        <select
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          required
          disabled={categorias.length === 0}
        >
          {categorias.length === 0 ? (
            <option value="">Sin categorías disponibles</option>
          ) : (
            categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))
          )}
        </select>
      </label>

      <label className="field">
        <span>EPC RFID (opcional)</span>
        <input
          value={epc}
          onChange={(e) => setEpc(e.target.value)}
          maxLength={96}
          placeholder="Se asigna automáticamente al imprimir etiqueta"
        />
      </label>

      <label className="field">
        <span>Datos técnicos JSON (opcional)</span>
        <textarea
          value={datosTecnicos}
          onChange={(e) => setDatosTecnicos(e.target.value)}
          rows={3}
          placeholder='{"marca": "Dell", "modelo": "Latitude 5540"}'
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
          disabled={submitting || categorias.length === 0}
        >
          {submitting ? "Guardando..." : buttonLabel}
        </button>
      </div>
    </form>
  );
}
