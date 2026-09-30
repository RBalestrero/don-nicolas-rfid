import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface ActionsMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface ActionsMenuProps {
  items: ActionsMenuItem[];
  disabled?: boolean;
  label?: string;
  /** Contenido extra dentro del panel (p. ej. grupo de export). */
  children?: ReactNode;
}

/** Desplegable compacto para agrupar acciones secundarias de un listado. */
export default function ActionsMenu({
  items,
  disabled,
  label = "Acciones",
  children,
}: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const hasItems = items.length > 0 || Boolean(children);

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

  if (!hasItems) return null;

  return (
    <div className="actions-menu export-menu" ref={rootRef}>
      <button
        type="button"
        className="btn secondary btn-sm"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <span className="export-menu-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          className="export-menu-panel"
          role="menu"
          id={menuId}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[role="menuitem"]')) {
              setOpen(false);
            }
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`export-menu-item${item.danger ? " is-danger" : ""}`}
              disabled={disabled || item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
          {children}
        </div>
      )}
    </div>
  );
}
