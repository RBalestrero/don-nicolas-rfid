/** Tamaños de página seleccionables en listados. */
export const TABLE_PAGE_SIZES = [25, 50, 100] as const;
export type TablePageSize = (typeof TABLE_PAGE_SIZES)[number];
export const TABLE_PAGE_DEFAULT: TablePageSize = 25;

export function slicePage<T>(items: T[], pageIndex: number, pageSize: number): T[] {
  const size = Math.max(1, pageSize);
  const start = Math.max(0, pageIndex) * size;
  return items.slice(start, start + size);
}

export function normalizePageSize(value: number): TablePageSize {
  if ((TABLE_PAGE_SIZES as readonly number[]).includes(value)) {
    return value as TablePageSize;
  }
  return TABLE_PAGE_DEFAULT;
}
