import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import type {
  Activo,
  ActivoCreatePayload,
  Categoria,
  Deposito,
  DepositoDetalle,
  SectorDetalle,
  Ubicacion,
} from "../types";

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
  const editing = Boolean(initial);
  const [numeroPatrimonial, setNumeroPatrimonial] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? "");
  const [serializado, setSerializado] = useState(false);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [detalle, setDetalle] = useState<DepositoDetalle | null>(null);
  const [depositoId, setDepositoId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [ubicacionId, setUbicacionId] = useState("");
  const [loadingDepositos, setLoadingDepositos] = useState(!editing);
  const [loadingTree, setLoadingTree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initial) {
      setNumeroPatrimonial("");
      setDescripcion("");
      setCategoriaId(categorias[0]?.id ?? "");
      setSerializado(false);
      return;
    }
    setNumeroPatrimonial(initial.numero_patrimonial);
    setDescripcion(initial.descripcion);
    setCategoriaId(initial.categoria_id);
    setSerializado(Boolean(initial.serializado));
  }, [initial, categorias]);

  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    (async () => {
      setLoadingDepositos(true);
      try {
        const data = await apiFetch<Deposito[]>("/depositos");
        if (!cancelled) setDepositos(data.filter((d) => d.activo));
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
  }, [editing]);

  useEffect(() => {
    if (editing || !depositoId) {
      setDetalle(null);
      setSectorId("");
      setUbicacionId("");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingTree(true);
      setSectorId("");
      setUbicacionId("");
      try {
        const tree = await apiFetch<DepositoDetalle>(
          `/depositos/${depositoId}?include_tree=true`,
        );
        if (!cancelled) setDetalle(tree);
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
  }, [depositoId, editing]);

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

    if (!categoriaId) {
      setError("Seleccioná una categoría o creá una antes de dar de alta un artículo.");
      return;
    }
    if (!editing && !ubicacionId) {
      setError("Seleccioná depósito, sector y ubicación.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        numero_patrimonial: numeroPatrimonial.trim(),
        descripcion: descripcion.trim(),
        categoria_id: categoriaId,
        serializado,
        ...(editing
          ? {}
          : {
              ubicacion_id: ubicacionId,
              epc: null,
              datos_tecnicos: null,
            }),
      });
      if (!editing) {
        setNumeroPatrimonial("");
        setDescripcion("");
        setSerializado(false);
        setDepositoId("");
        setSectorId("");
        setUbicacionId("");
        setDetalle(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el artículo");
    } finally {
      setSubmitting(false);
    }
  };

  const buttonLabel =
    submitLabel ?? (editing ? "Guardar cambios" : "Dar de alta artículo");

  return (
    <form
      className="form"
      onSubmit={handleSubmit}
      aria-label={editing ? "Formulario de edición de artículo" : "Formulario de alta de artículo"}
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

      <label className="field checkbox-field">
        <input
          type="checkbox"
          checked={serializado}
          onChange={(e) => setSerializado(e.target.checked)}
          disabled={submitting}
        />
        <span>
          Artículo serializado
          <span className="muted field-hint">
            {" "}
            — al imprimir/codificar se pedirá el Nº de serie de fábrica de cada unidad
          </span>
        </span>
      </label>

      {!editing && (
        <fieldset className="form-grid ubicacion-inicial">
          <legend className="sr-only">Ubicación inicial</legend>
          <label className="field">
            <span>Depósito</span>
            <select
              value={depositoId}
              onChange={(e) => setDepositoId(e.target.value)}
              required
              disabled={loadingDepositos || submitting}
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
            <span>Sector</span>
            <select
              value={sectorId}
              onChange={(e) => setSectorId(e.target.value)}
              required
              disabled={!depositoId || loadingTree || submitting}
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
            <span>Ubicación</span>
            <select
              value={ubicacionId}
              onChange={(e) => setUbicacionId(e.target.value)}
              required
              disabled={!sectorId || submitting}
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
        </fieldset>
      )}

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
          disabled={
            submitting ||
            categorias.length === 0 ||
            (!editing && (loadingDepositos || depositos.length === 0))
          }
        >
          {submitting ? "Guardando..." : buttonLabel}
        </button>
      </div>
    </form>
  );
}
