import { useEffect, useMemo, useRef, useState } from "react";
import {
  TABLE_PAGE_DEFAULT,
  type TablePageSize,
  normalizePageSize,
  slicePage,
} from "./tablePaging";

/**
 * Paginación client-side con tamaño de página seleccionable (25 / 50 / 100).
 */
export function useTablePaging<T>(items: T[], resetKey?: string | number) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSizeState] = useState<TablePageSize>(TABLE_PAGE_DEFAULT);
  const [pageIndex, setPageIndex] = useState(0);

  const setPageSize = (next: number) => {
    const size = normalizePageSize(next);
    setPageSizeState(size);
    setPageIndex(0);
  };

  useEffect(() => {
    setPageIndex(0);
  }, [resetKey, items.length]);

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  const safeIndex = Math.min(pageIndex, pages - 1);

  useEffect(() => {
    if (safeIndex !== pageIndex) setPageIndex(safeIndex);
  }, [safeIndex, pageIndex]);

  const pageItems = useMemo(
    () => slicePage(items, safeIndex, pageSize),
    [items, safeIndex, pageSize],
  );

  const from = total === 0 ? 0 : safeIndex * pageSize + 1;
  const to = Math.min(safeIndex * pageSize + pageItems.length, total);
  const canPrev = safeIndex > 0;
  const canNext = safeIndex + 1 < pages;

  return {
    viewportRef,
    pageSize,
    setPageSize,
    pageIndex: safeIndex,
    setPageIndex,
    pageItems,
    total,
    from,
    to,
    pages,
    canPrev,
    canNext,
    goPrev: () => setPageIndex((p) => Math.max(0, p - 1)),
    goNext: () => setPageIndex((p) => p + 1),
  };
}
