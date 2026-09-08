import { useEffect, useState } from "react";
import { apiFetchBlob } from "../lib/api";

interface AuthImageProps {
  path: string;
  alt: string;
  className?: string;
}

export default function AuthImage({ path, alt, className }: AuthImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    setSrc(null);
    setFailed(false);

    apiFetchBlob(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed) {
    return <div className={`auth-image-fallback ${className ?? ""}`}>Sin vista previa</div>;
  }

  if (!src) {
    return <div className={`auth-image-fallback muted ${className ?? ""}`}>Cargando…</div>;
  }

  return <img src={src} alt={alt} className={className} />;
}
