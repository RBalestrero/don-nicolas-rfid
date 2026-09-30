import { useEffect, useId, useRef, useState } from "react";
import { downloadReport } from "../lib/api";
import { useToast } from "../context/ToastContext";

interface ExportButtonsProps {
  /** Path relativo sin query, ej. /reportes/movimientos */
  basePath: string;
  /** Nombre base para fallback, ej. movimientos.xlsx */
  filenameBase: string;
  formats?: Array<"csv" | "xlsx" | "pdf">;
  query?: Record<string, string | undefined>;
  disabled?: boolean;
  /** `inline` = botones sueltos (default). `menu` = un desplegable. `items` = solo ítems para anidar en Acciones. */
  variant?: "inline" | "menu" | "items";
}

export default function ExportButtons({
  basePath,
  filenameBase,
  formats = ["xlsx", "csv"],
  query,
  disabled,
  variant = "inline",
}: ExportButtonsProps) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const download = async (formato: string) => {
    setBusy(formato);
    setError(null);
    try {
      const params = new URLSearchParams({ formato });
      if (query) {
        for (const [key, value] of Object.entries(query)) {
          if (value) params.set(key, value);
        }
      }
      const ext = formato === "xlsx" ? "xlsx" : formato;
      await downloadReport(`${basePath}?${params.toString()}`, `${filenameBase}.${ext}`);
      toast.success(`Exportado ${formato.toUpperCase()}`);
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al exportar";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  if (variant === "items") {
    return (
      <>
        {formats.map((formato) => (
          <button
            key={formato}
            type="button"
            role="menuitem"
            className="export-menu-item"
            disabled={disabled || busy !== null}
            aria-label={`Exportar ${formato.toUpperCase()}`}
            onClick={() => void download(formato)}
          >
            {busy === formato ? "…" : `Exportar ${formato.toUpperCase()}`}
          </button>
        ))}
        {error && <span className="error export-error">{error}</span>}
      </>
    );
  }

  if (variant === "menu") {
    return (
      <div className="export-menu" ref={rootRef}>
        <button
          type="button"
          className="btn secondary btn-sm"
          disabled={disabled || busy !== null}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
        >
          {busy ? "…" : "Exportar"}
          <span className="export-menu-caret" aria-hidden>
            ▾
          </span>
        </button>
        {open && (
          <div className="export-menu-panel" role="menu" id={menuId}>
            {formats.map((formato) => (
              <button
                key={formato}
                type="button"
                role="menuitem"
                className="export-menu-item"
                disabled={disabled || busy !== null}
                aria-label={`Exportar ${formato.toUpperCase()}`}
                onClick={() => void download(formato)}
              >
                {busy === formato ? "…" : formato.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        {error && <span className="error export-error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="export-actions">
      {formats.map((formato) => (
        <button
          key={formato}
          type="button"
          className="btn secondary btn-sm"
          disabled={disabled || busy !== null}
          aria-label={`Exportar ${formato.toUpperCase()}`}
          onClick={() => void download(formato)}
        >
          {busy === formato ? "…" : formato.toUpperCase()}
        </button>
      ))}
      {error && <span className="error export-error">{error}</span>}
    </div>
  );
}
