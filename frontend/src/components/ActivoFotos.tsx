import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type { Fotografia } from "../types";
import AuthImage from "./AuthImage";

interface ActivoFotosProps {
  activoId: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ActivoFotos({ activoId }: ActivoFotosProps) {
  const [fotos, setFotos] = useState<Fotografia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [esPrincipal, setEsPrincipal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadFotos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Fotografia[]>(`/activos/${activoId}/fotografias`);
      setFotos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar fotografías");
    } finally {
      setLoading(false);
    }
  }, [activoId]);

  useEffect(() => {
    loadFotos();
  }, [loadFotos]);

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Seleccioná una imagen para subir.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const qs = esPrincipal ? "?es_principal=true" : "";
      await apiFetch<Fotografia>(`/activos/${activoId}/fotografias${qs}`, {
        method: "POST",
        body,
      });
      setFile(null);
      setEsPrincipal(false);
      await loadFotos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la fotografía");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fotoId: string) => {
    if (!window.confirm("¿Eliminar esta fotografía?")) return;
    setError(null);
    try {
      await apiFetch<void>(`/fotografias/${fotoId}`, { method: "DELETE" });
      await loadFotos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar la fotografía");
    }
  };

  return (
    <div className="activo-fotos">
      <form className="form foto-upload-form" onSubmit={handleUpload} aria-label="Subir fotografía">
        <label className="field">
          <span>Archivo de imagen</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={esPrincipal}
            onChange={(e) => setEsPrincipal(e.target.checked)}
          />
          <span>Marcar como principal</span>
        </label>
        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={uploading || !file}>
            {uploading ? "Subiendo..." : "Subir foto"}
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="muted">Cargando fotografías...</p>
      ) : fotos.length === 0 ? (
        <p className="muted">Todavía no hay fotos para este activo.</p>
      ) : (
        <ul className="foto-grid" aria-label="Fotografías del activo">
          {fotos.map((foto) => (
            <li key={foto.id} className="foto-card">
              <AuthImage
                path={`/fotografias/${foto.id}/archivo`}
                alt={foto.nombre_archivo}
                className="foto-thumb"
              />
              <div className="foto-meta">
                <strong className="foto-name">{foto.nombre_archivo}</strong>
                <span className="muted">
                  {formatBytes(foto.tamano_bytes)}
                  {foto.es_principal ? " · Principal" : ""}
                </span>
                <button
                  type="button"
                  className="btn secondary btn-sm danger"
                  onClick={() => handleDelete(foto.id)}
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
