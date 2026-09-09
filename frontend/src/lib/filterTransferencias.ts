import type { TransferenciaListItem } from "../types";

export interface TransferenciasFilterOpts {
  search: string;
  estado: string;
}

export function filterTransferencias(
  lista: TransferenciaListItem[],
  opts: TransferenciasFilterOpts,
  nombreDeposito: (id: string) => string,
): TransferenciaListItem[] {
  const q = opts.search.trim().toLowerCase();
  return lista.filter((t) => {
    if (opts.estado && t.estado !== opts.estado) return false;
    if (!q) return true;
    const haystack = [
      nombreDeposito(t.deposito_origen_id),
      nombreDeposito(t.deposito_destino_id),
      t.estado,
      String(t.total_activos),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function hasActiveTransferenciasFilters(opts: TransferenciasFilterOpts): boolean {
  return Boolean(opts.search.trim() || opts.estado);
}
