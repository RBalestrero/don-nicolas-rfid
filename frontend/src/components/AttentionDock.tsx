import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import {
  buildAttentionItems,
  openAttentionItem,
  type AttentionItem,
} from "../lib/attentionItems";
import type { DashboardResumen } from "../types";
import type { AppPage } from "../lib/appPages";
import EmptyState from "./EmptyState";

const ATTN_POLL_MS = 35_000;
const STORAGE_KEY = "dn_attn_dock";

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

interface AttentionDockProps {
  onNavigate: (page: AppPage) => void;
  onCountChange?: (count: number) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

/** Dock derecho global: bandeja “Requiere atención” (colapsable / drawer móvil). */
export default function AttentionDock({
  onNavigate,
  onCountChange,
  mobileOpen,
  onMobileOpenChange,
}: AttentionDockProps) {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const load = useCallback(async (signal?: AbortSignal, silent = false) => {
    try {
      const data = await apiFetch<DashboardResumen>(
        "/dashboard/resumen?movimientos_limit=1&ops_limit=12",
        { signal },
      );
      if (signal?.aborted) return;
      setItems(buildAttentionItems(data));
    } catch {
      if (!silent && !signal?.aborted) {
        /* poll silencioso: no romper la UI si falla una tanda */
      }
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    const timer = window.setInterval(() => {
      void load(undefined, true);
    }, ATTN_POLL_MS);
    return () => {
      ac.abort();
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    onCountChange?.(items.length);
  }, [items.length, onCountChange]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded");
    } catch {
      /* ignore quota */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileOpenChange]);

  const handleOpen = (item: AttentionItem) => {
    openAttentionItem(item, onNavigate);
    onMobileOpenChange(false);
  };

  const dangerCount = items.filter((i) => i.severity === "danger").length;

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="attn-dock-backdrop"
          aria-label="Cerrar panel de atención"
          onClick={() => onMobileOpenChange(false)}
        />
      )}
      <aside
        className={[
          "attn-dock",
          collapsed ? "is-collapsed" : "is-expanded",
          mobileOpen ? "is-mobile-open" : "",
          items.length === 0 ? "is-clear" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Requiere atención"
      >
        <div className="attn-dock-rail">
          <button
            type="button"
            className="attn-dock-toggle"
            aria-expanded={!collapsed}
            aria-controls="attn-dock-panel"
            title={collapsed ? "Expandir atención" : "Colapsar atención"}
            onClick={() => setCollapsed((c) => !c)}
          >
            <span className="attn-dock-toggle-label">Atención</span>
            <span
              className={`attn-dock-badge${dangerCount > 0 ? " is-danger" : items.length > 0 ? " is-warn" : ""}`}
            >
              {items.length}
            </span>
          </button>
        </div>

        <div id="attn-dock-panel" className="attn-dock-panel">
          <div className="attn-dock-header">
            <h2>Requiere atención</h2>
            <span className="section-count">
              {items.length === 0
                ? "Sin alertas"
                : `${items.length} ítem${items.length === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              className="btn ghost btn-sm attn-dock-collapse"
              aria-label="Colapsar panel"
              onClick={() => {
                setCollapsed(true);
                onMobileOpenChange(false);
              }}
            >
              ›
            </button>
          </div>

          {items.length === 0 ? (
            <EmptyState
              title="Todo en orden"
              description="No hay discrepancias, auditorías pendientes ni activos sin ubicación."
            />
          ) : (
            <ul className="ops-queue attn-queue" aria-label="Bandeja de atención">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`ops-item attn-item severity-${item.severity}`}
                    onClick={() => handleOpen(item)}
                  >
                    <span className={`badge ${item.severity}`}>{item.badge}</span>
                    <span className="ops-body">
                      <strong>{item.title}</strong>
                      <span className="muted">{item.detail}</span>
                    </span>
                    {item.when && (
                      <span className="ops-time muted">{formatFecha(item.when)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
