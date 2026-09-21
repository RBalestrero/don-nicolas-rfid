import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { apiFetch } from "../lib/api";
import type { Fotografia } from "../types";
import AuthImage from "./AuthImage";
import ConfirmDialog from "./ConfirmDialog";

interface ActivoFotosProps {
  activoId: string;
  canWrite?: boolean;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ActivoFotos({ activoId, canWrite = true }: ActivoFotosProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<Fotografia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [esPrincipal, setEsPrincipal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadFotos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Fotografia[]>(`/activos/${activoId}/fotografias`);
      setFotos(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar fotografías");
    } finally {
      setLoading(false);
    }
  }, [activoId]);

  useEffect(() => {
    void loadFotos();
  }, [loadFotos]);

  const uploadFile = async (file: File) => {
    if (!canWrite) return;
    if (!file.type.startsWith("image/")) {
      setError("Seleccioná un archivo de imagen (JPEG, PNG, WebP o GIF).");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const qs = esPrincipal || fotos.length === 0 ? "?es_principal=true" : "";
      await apiFetch<Fotografia>(`/activos/${activoId}/fotografias${qs}`, {
        method: "POST",
        body,
      });
      setEsPrincipal(false);
      await loadFotos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la fotografía");
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadFile(file);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await apiFetch<void>(`/fotografias/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      await loadFotos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar la fotografía");
    } finally {
      setDeleteBusy(false);
    }
  };

  const dropzone = canWrite ? (
    <div className="foto-dropzone-wrap">
      <label
        htmlFor={inputId}
        className={`foto-dropzone${dragOver ? " is-dragover" : ""}${uploading ? " is-busy" : ""}`}
        aria-label="Subir fotografía"
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <span className="foto-dropzone-title">
          {uploading ? "Subiendo…" : "Soltá una imagen o elegí archivo"}
        </span>
        <span className="foto-dropzone-hint muted">JPEG, PNG, WebP o GIF</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          disabled={uploading}
          onChange={onFileChange}
        />
      </label>
      {fotos.length > 0 && (
        <label className="field checkbox-field foto-principal-opt">
          <input
            type="checkbox"
            checked={esPrincipal}
            disabled={uploading}
            onChange={(e) => setEsPrincipal(e.target.checked)}
          />
          <span>Marcar próxima como principal</span>
        </label>
      )}
    </div>
  ) : (
    <p className="muted">Solo lectura — tu rol no puede subir ni eliminar fotos.</p>
  );

  return (
    <div className="activo-fotos">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="muted">Cargando fotografías...</p>
      ) : fotos.length === 0 ? (
        <div className="foto-empty">
          {canWrite ? (
            <>
              <p className="foto-empty-title">Todavía no hay fotos</p>
              <p className="muted foto-empty-hint">Agregá la primera imagen del artículo.</p>
              {dropzone}
            </>
          ) : (
            <p className="muted">Todavía no hay fotos para este activo.</p>
          )}
        </div>
      ) : (
        <>
          {dropzone}
          <ul className="foto-grid" aria-label="Fotografías del activo">
            {fotos.map((foto) => (
              <li key={foto.id} className="foto-card">
                <div className="foto-thumb-wrap">
                  <AuthImage
                    path={`/fotografias/${foto.id}/archivo`}
                    alt={foto.nombre_archivo}
                    className="foto-thumb"
                  />
                  {foto.es_principal && (
                    <span className="foto-principal-badge">Principal</span>
                  )}
                  {canWrite && (
                    <button
                      type="button"
                      className="foto-delete-overlay"
                      aria-label={`Eliminar ${foto.nombre_archivo}`}
                      title="Eliminar"
                      onClick={() => setDeleteId(foto.id)}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                <div className="foto-meta">
                  <strong className="foto-name" title={foto.nombre_archivo}>
                    {foto.nombre_archivo}
                  </strong>
                  <span className="muted">{formatBytes(foto.tamano_bytes)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar fotografía"
        description="La imagen se borrará del activo. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
