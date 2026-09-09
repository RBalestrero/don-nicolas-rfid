import type { Activo, UbicacionAsignada } from "../types";

export type UbicacionFilter = "all" | "con" | "sin";

export interface ActivosFilterOpts {
  search: string;
  categoriaId: string;
  ubicacion: UbicacionFilter;
}

export function filterActivos(
  activos: Activo[],
  ubicaciones: Record<string, UbicacionAsignada | null | undefined>,
  opts: ActivosFilterOpts,
): Activo[] {
  const q = opts.search.trim().toLowerCase();
  return activos.filter((a) => {
    if (opts.categoriaId && a.categoria_id !== opts.categoriaId) return false;

    const ubi = ubicaciones[a.id];
    if (opts.ubicacion === "con" && !ubi) return false;
    if (opts.ubicacion === "sin" && ubi) return false;

    if (!q) return true;
    const haystack = [
      a.numero_patrimonial,
      a.descripcion,
      a.epc ?? "",
      a.categoria?.nombre ?? "",
      ubi
        ? `${ubi.deposito_nombre} ${ubi.sector_nombre} ${ubi.ubicacion_codigo}`
        : "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function hasActiveActivosFilters(opts: ActivosFilterOpts): boolean {
  return Boolean(opts.search.trim() || opts.categoriaId || opts.ubicacion !== "all");
}
