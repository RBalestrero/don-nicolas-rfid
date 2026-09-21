import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Nombre de la sección. Es el único h1 del workspace. */
  title: string;
  /** Una línea: qué se puede hacer acá / por qué importa. */
  subtitle?: string;
  /**
   * Dato breve al lado del título (p. ej. "12 artículos").
   * Preferir lenguaje llano; no duplicar contadores que ya están en el cuerpo.
   */
  leading?: ReactNode;
  /** Navegación de sección (tabs). Se renderiza debajo del toolbar. */
  tabs?: ReactNode;
  /** Acciones primarias / secundarias a la derecha. */
  children?: ReactNode;
}

/** Encabezado de página: título, contexto y acciones de la sección. */
export default function PageHeader({
  title,
  subtitle,
  leading,
  tabs,
  children,
}: PageHeaderProps) {
  return (
    <header className="page-toolbar">
      <div className="page-toolbar-row">
        <div className="page-toolbar-leading">
          <div className="page-title-block">
            <div className="page-title-row">
              <h1 className="page-title">{title}</h1>
              {leading ? <div className="page-meta">{leading}</div> : null}
            </div>
            {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
          </div>
        </div>
        {children ? <div className="page-toolbar-actions">{children}</div> : null}
      </div>
      {tabs ? <div className="page-toolbar-tabs">{tabs}</div> : null}
    </header>
  );
}
