import type { InventarioListItem } from "../types";

export interface InventariosFilterOpts {
  search: string;
  estado: string;
  soloDiscrepancias: boolean;
  soloPendienteAuditoria: boolean;
}

export function filterInventarios(
  lista: InventarioListItem[],
  opts: InventariosFilterOpts,
  nombreDeposito: (id: string) => string,
): InventarioListItem[] {
  const q = opts.search.trim().toLowerCase();
  return lista.filter((item) => {
    if (opts.estado && item.estado !== opts.estado) return false;
    if (opts.soloDiscrepancias) {
      const disc = (item.total_faltante ?? 0) > 0 || (item.total_sobrante ?? 0) > 0;
      if (!disc) return false;
    }
    if (opts.soloPendienteAuditoria) {
      if (item.estado !== "cerrado" || item.auditado) return false;
    }
    if (!q) return true;
    const haystack = [
      nombreDeposito(item.deposito_id),
      item.estado,
      estadoLabel(item.estado),
      item.auditado ? "auditada auditado" : "pendiente auditoría",
      item.comentario_auditoria ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function estadoLabel(estado: string): string {
  if (estado === "en_curso") return "en curso";
  if (estado === "cerrado") return "cerrado";
  return estado;
}

export function hasActiveInventariosFilters(opts: InventariosFilterOpts): boolean {
  return Boolean(
    opts.search.trim() || opts.estado || opts.soloDiscrepancias || opts.soloPendienteAuditoria,
  );
}
