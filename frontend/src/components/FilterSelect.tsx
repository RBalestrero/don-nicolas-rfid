import { useEffect, useId, useRef, useState } from "react";

export interface FilterSelectOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  value: string;
  options: FilterSelectOption[];
  /** Texto del trigger cuando no hay valor (p. ej. "Estado"). */
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Si true, no ofrece opción vacía (valor siempre requerido). */
  required?: boolean;
  "aria-label"?: string;
}

/** Desplegable de filtro con el mismo lenguaje visual que Acciones. */
export default function FilterSelect({
  value,
  options,
  placeholder,
  onChange,
  disabled,
  required = false,
  "aria-label": ariaLabel,
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = options.find((o) => o.value === value);
  const active = Boolean(value) && !required;

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

  return (
    <div className="filter-select export-menu" ref={rootRef}>
      <button
        type="button"
        className={`btn btn-sm filter-trigger${active ? " is-active" : " secondary"}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-label={ariaLabel ?? placeholder}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="filter-trigger-label">{selected?.label ?? placeholder}</span>
        <span className="export-menu-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="export-menu-panel" role="listbox" id={menuId} aria-label={placeholder}>
          {!required && (
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className={`export-menu-item${!value ? " is-selected" : ""}`}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {placeholder}
            </button>
          )}
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              className={`export-menu-item${value === opt.value ? " is-selected" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
