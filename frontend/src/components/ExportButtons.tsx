import { useState } from "react";
import { downloadReport } from "../lib/api";

interface ExportButtonsProps {
  /** Path relativo sin query, ej. /reportes/movimientos */
  basePath: string;
  /** Nombre base para fallback, ej. movimientos.xlsx */
  filenameBase: string;
  formats?: Array<"csv" | "xlsx" | "pdf">;
  query?: Record<string, string | undefined>;
  disabled?: boolean;
}

export default function ExportButtons({
  basePath,
  filenameBase,
  formats = ["xlsx", "csv"],
  query,
  disabled,
}: ExportButtonsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al exportar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="export-actions">
      {formats.map((formato) => (
        <button
          key={formato}
          type="button"
          className="btn secondary btn-sm"
          disabled={disabled || busy !== null}
          onClick={() => download(formato)}
        >
          {busy === formato ? "…" : formato.toUpperCase()}
        </button>
      ))}
      {error && <span className="error export-error">{error}</span>}
    </div>
  );
}
