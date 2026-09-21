import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ModalSize = "sm" | "md" | "lg" | "xl";

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  size?: ModalSize;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra class on `.modal-dialog` (modifiers, fixed-height layouts). */
  className?: string;
  /** Si false, el backdrop no cierra el modal (acciones críticas). Default true. */
  closeOnBackdrop?: boolean;
  /** Si false, Escape no cierra el modal (p.ej. mientras busy). Default true. */
  closeOnEscape?: boolean;
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}

export default function Modal({
  open,
  title,
  subtitle,
  size = "md",
  onClose,
  children,
  footer,
  className,
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
      previousFocus.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (closeOnEscape) onClose();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = getFocusable(dialogRef.current);
    if (focusable.length === 0) {
      e.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop) return;
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onBackdrop} onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        className={["modal-dialog", `modal-${size}`, className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-heading">
            <h3 id={titleId}>{title}</h3>
            {subtitle && (
              <p id={descId} className="muted modal-subtitle">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn ghost btn-sm modal-close"
            aria-label="Cerrar"
            disabled={!closeOnEscape}
            onClick={() => {
              if (closeOnEscape) onClose();
            }}
          >
            <i className="bi bi-x-lg" aria-hidden />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
