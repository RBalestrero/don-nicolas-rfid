import type { ReactNode } from "react";

interface PageHeaderProps {
  /**
   * @deprecated El título de página vive en la topbar (`App.tsx`).
   * Se acepta por compatibilidad y no se renderiza.
   */
  title?: string;
  /**
   * @deprecated El subtítulo de página vive en la topbar (`App.tsx`).
   * Se acepta por compatibilidad y no se renderiza.
   */
  subtitle?: string;
  /**
   * Dato breve a la izquierda (p. ej. contador). Preferir `.section-count`.
   */
  leading?: ReactNode;
  /** Navegación de sección (tabs). Se renderiza debajo del toolbar. */
  tabs?: ReactNode;
  /** Acciones primarias / secundarias a la derecha. */
  children?: ReactNode;
}

/**
 * Toolbar compacta de página: meta/acciones/tabs.
 * El h1 queda en la topbar; acá solo chrome operativo.
 */
export default function PageHeader({
  leading,
  tabs,
  children,
}: PageHeaderProps) {
  if (!leading && !tabs && !children) return null;

  // `div` (not `header`): el banner del documento ya es `.topbar` en App.
  return (
    <div className="page-toolbar">
      <div className="page-toolbar-row">
        {leading ? <div className="page-toolbar-leading">{leading}</div> : null}
        {children ? <div className="page-toolbar-actions">{children}</div> : null}
      </div>
      {tabs ? <div className="page-toolbar-tabs">{tabs}</div> : null}
    </div>
  );
}
