import type { HistorialEntry } from "../types";

const ACCION_LABELS: Record<string, string> = {
  creacion: "Alta",
  actualizacion: "Actualización",
  desactivacion: "Baja",
  asignacion_ubicacion: "Asignación de ubicación",
  desasignacion_ubicacion: "Quita de ubicación",
  etiqueta_impresa: "Impresión de etiqueta",
  foto_agregada: "Foto agregada",
  foto_eliminada: "Foto eliminada",
  transferencia: "Transferencia",
};

function formatAccion(accion: string): string {
  return ACCION_LABELS[accion] ?? accion.replace(/_/g, " ");
}

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR");
  } catch {
    return iso;
  }
}

function formatCambios(cambios: Record<string, unknown> | null): string | null {
  if (!cambios || Object.keys(cambios).length === 0) return null;
  return Object.entries(cambios)
    .map(([campo, valor]) => {
      if (valor && typeof valor === "object" && "anterior" in valor && "nuevo" in valor) {
        const v = valor as { anterior: unknown; nuevo: unknown };
        return `${campo}: ${JSON.stringify(v.anterior)} → ${JSON.stringify(v.nuevo)}`;
      }
      return `${campo}: ${JSON.stringify(valor)}`;
    })
    .join(" · ");
}

interface ActivoHistorialProps {
  entries: HistorialEntry[];
  loading: boolean;
}

export default function ActivoHistorial({ entries, loading }: ActivoHistorialProps) {
  if (loading) {
    return <p className="muted">Cargando historial...</p>;
  }

  if (entries.length === 0) {
    return <p className="muted">Sin eventos registrados para este activo.</p>;
  }

  return (
    <ol className="historial-list" aria-label="Historial del activo">
      {entries.map((entry) => {
        const detalle = formatCambios(entry.cambios);
        return (
          <li key={entry.id} className="historial-item">
            <div className="historial-head">
              <strong>{formatAccion(entry.accion)}</strong>
              <span className="muted">{formatFecha(entry.creado_en)}</span>
            </div>
            <p className="muted historial-user">
              {entry.usuario_nombre ?? "Sistema"}
            </p>
            {detalle && <p className="historial-cambios mono">{detalle}</p>}
          </li>
        );
      })}
    </ol>
  );
}
