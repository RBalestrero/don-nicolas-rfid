import { useEffect, useRef } from "react";
import type { HistorialEntry } from "../types";
import { summarizeEvent } from "../lib/eventSummary";

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface ActivoHistorialProps {
  entries: HistorialEntry[];
  loading: boolean;
  focusId?: string | null;
}

export default function ActivoHistorial({ entries, loading, focusId = null }: ActivoHistorialProps) {
  const focusRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!focusId || loading) return;
    focusRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusId, loading, entries]);

  if (loading) {
    return <p className="muted">Cargando historial...</p>;
  }

  if (entries.length === 0) {
    return <p className="muted">Todavía no hay eventos registrados para este artículo.</p>;
  }

  return (
    <ol className="evento-timeline" aria-label="Historial del activo">
      {entries.map((entry) => {
        const view = summarizeEvent(entry.accion, entry.cambios);
        const focused = focusId === entry.id;
        return (
          <li
            key={entry.id}
            ref={focused ? focusRef : undefined}
            className={`evento-item tone-${view.tone}${focused ? " is-focus" : ""}`}
            aria-current={focused ? "true" : undefined}
          >
            <div className="evento-icon" aria-hidden>
              <i className={`bi ${view.icon}`} />
            </div>
            <div className="evento-body">
              <div className="evento-head">
                <strong>{view.title}</strong>
                <time dateTime={entry.creado_en} className="muted">
                  {formatFecha(entry.creado_en)}
                </time>
              </div>
              {view.facts.length > 0 && (
                <ul className="evento-facts">
                  {view.facts.map((f, i) => (
                    <li key={`${entry.id}-${i}`}>{f}</li>
                  ))}
                </ul>
              )}
              <div className="evento-meta">
                <span className="muted">
                  <i className="bi bi-person" aria-hidden />{" "}
                  {entry.usuario_nombre ?? "Sistema"}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
