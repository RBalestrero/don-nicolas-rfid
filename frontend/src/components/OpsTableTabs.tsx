import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
} from "react";

export type OpsTableTab = "historial" | "inventarios" | "movimientos";

export const OPS_TABLE_TABS: { id: OpsTableTab; label: string }[] = [
  { id: "historial", label: "Historial" },
  { id: "inventarios", label: "Inventarios" },
  { id: "movimientos", label: "Movimientos" },
];

export const OPS_TAB_STORAGE_KEY = "dn_ops_tab";

export function readOpsTableTab(): OpsTableTab | null {
  try {
    const v = sessionStorage.getItem(OPS_TAB_STORAGE_KEY);
    if (v === "historial" || v === "inventarios" || v === "movimientos") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeOpsTableTab(tab: OpsTableTab): void {
  try {
    sessionStorage.setItem(OPS_TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
}

interface OpsTableTabsProps {
  value: OpsTableTab;
  onChange: (tab: OpsTableTab) => void;
  /** Prefijo estable para id de tabs/panels (a11y). */
  id?: string;
}

/** Tabs Historial / Inventarios / Movimientos (chrome de Operaciones). */
export default function OpsTableTabs({ value, onChange, id }: OpsTableTabsProps): ReactNode {
  const reactId = useId();
  const tabsId = id ?? reactId;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (
      e.key !== "ArrowRight" &&
      e.key !== "ArrowLeft" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % OPS_TABLE_TABS.length;
    if (e.key === "ArrowLeft") next = (index - 1 + OPS_TABLE_TABS.length) % OPS_TABLE_TABS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = OPS_TABLE_TABS.length - 1;
    onChange(OPS_TABLE_TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="tabs table-chrome-tabs" role="tablist" aria-label="Secciones de operaciones">
      {OPS_TABLE_TABS.map((t, i) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${tabsId}-tab-${t.id}`}
          className={`tab ${value === t.id ? "active" : ""}`}
          aria-selected={value === t.id}
          aria-controls={`${tabsId}-panel-${t.id}`}
          tabIndex={value === t.id ? 0 : -1}
          ref={(el) => {
            tabRefs.current[i] = el;
          }}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
