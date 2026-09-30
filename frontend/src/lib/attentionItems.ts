import type { DashboardResumen } from "../types";
import type { AppPage } from "./appPages";

export type { AppPage } from "./appPages";
export type AttentionSeverity = "danger" | "warn";

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  badge: string;
  title: string;
  detail: string;
  when?: string | null;
  page: AppPage;
  filterKey?: string;
  filterValue?: string;
}

/** Construye la bandeja de atención a partir del resumen del dashboard. */
export function buildAttentionItems(resumen: DashboardResumen): AttentionItem[] {
  const { kpis } = resumen;
  const sinUbicar =
    typeof kpis.activos_sin_ubicacion === "number"
      ? kpis.activos_sin_ubicacion
      : Math.max(0, kpis.activos_activos - kpis.stock_total_ubicado);
  const cobertura =
    typeof kpis.cobertura_ubicacion_pct === "number"
      ? kpis.cobertura_ubicacion_pct
      : kpis.activos_activos > 0
        ? Math.round((kpis.stock_total_ubicado / kpis.activos_activos) * 100)
        : 0;

  const atencion: AttentionItem[] = [];
  let listadosDisc = 0;
  let listadosSinAuditar = 0;
  const discPendiente = kpis.inventarios_con_discrepancia_pendiente ?? 0;
  const auditPendiente = kpis.inventarios_pendientes_auditoria ?? 0;

  for (const inv of resumen.inventarios_recientes) {
    if (inv.estado !== "cerrado") continue;
    if (typeof inv.auditado !== "boolean") continue;
    if (inv.auditado) continue;

    const conDiff = inv.total_faltante > 0 || (inv.total_exceso ?? 0) > 0;
    listadosSinAuditar += 1;
    if (conDiff) {
      listadosDisc += 1;
      const exceso = inv.total_exceso ?? 0;
      atencion.push({
        id: `inv-disc-${inv.id}`,
        severity: "danger",
        badge: "Discrepancia",
        title: `Inventario · ${inv.deposito_nombre ?? "Depósito"}`,
        detail: `${inv.total_faltante} faltante${inv.total_faltante === 1 ? "" : "s"} · ${exceso} exceso${exceso === 1 ? "" : "s"} · sin auditar`,
        when: inv.cerrado_en,
        page: "inventarios",
        filterKey: "dn_inv_filter",
        filterValue: "discrepancias",
      });
    } else {
      atencion.push({
        id: `inv-audit-${inv.id}`,
        severity: "warn",
        badge: "Auditoría",
        title: `Inventario · ${inv.deposito_nombre ?? "Depósito"}`,
        detail: "Cerrado y pendiente de marcar como auditado",
        when: inv.cerrado_en,
        page: "inventarios",
        filterKey: "dn_inv_filter",
        filterValue: "pendiente_auditoria",
      });
    }
  }

  const restoDisc = Math.max(0, discPendiente - listadosDisc);
  const listadosSoloAudit = Math.max(0, listadosSinAuditar - listadosDisc);
  const restoAudit = Math.max(0, auditPendiente - discPendiente - listadosSoloAudit);

  if (restoDisc > 0) {
    atencion.push({
      id: "inv-disc-more",
      severity: "danger",
      badge: "Discrepancia",
      title: `${restoDisc} inventario${restoDisc === 1 ? "" : "s"} con diferencia`,
      detail: "Cerrados, con faltantes/excesos y aún sin auditar",
      page: "inventarios",
      filterKey: "dn_inv_filter",
      filterValue: "discrepancias",
    });
  }

  if (restoAudit > 0) {
    atencion.push({
      id: "inv-audit-more",
      severity: "warn",
      badge: "Auditoría",
      title: `${restoAudit} inventario${restoAudit === 1 ? "" : "s"} sin auditar`,
      detail: "Sesiones cerradas sin diferencia, pendientes de revisión",
      page: "inventarios",
      filterKey: "dn_inv_filter",
      filterValue: "pendiente_auditoria",
    });
  }

  if (sinUbicar > 0) {
    atencion.push({
      id: "act-sin-ubi",
      severity: "warn",
      badge: "Ubicación",
      title: `${sinUbicar} activo${sinUbicar === 1 ? "" : "s"} sin ubicación`,
      detail: `${cobertura}% de cobertura · ${kpis.stock_total_ubicado}/${kpis.activos_activos} ubicados`,
      page: "activos",
      filterKey: "dn_act_filter",
      filterValue: "sin",
    });
  }

  atencion.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "danger" ? -1 : 1;
  });

  return atencion;
}

/** Evento para que páginas ya montadas relean flags de sessionStorage. */
export const SESSION_NAV_EVENT = "dn-session-nav";

export function signalSessionNav(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_NAV_EVENT));
  }
}

export function openAttentionItem(
  item: AttentionItem,
  onNavigate?: (page: AppPage) => void,
): void {
  if (item.filterKey && item.filterValue) {
    sessionStorage.setItem(item.filterKey, item.filterValue);
  }
  signalSessionNav();
  onNavigate?.(item.page);
}
