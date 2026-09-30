import FilterSelect from "./FilterSelect";
import { TABLE_PAGE_SIZES } from "../lib/tablePaging";

interface TablePagerProps {
  from: number;
  to: number;
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  canPrev: boolean;
  canNext: boolean;
  busy?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPageSizeChange: (size: number) => void;
  label?: string;
}

/** Controles de paginación + selector de cantidad (25 / 50 / 100). */
export default function TablePager({
  from,
  to,
  total,
  page,
  pages,
  pageSize,
  canPrev,
  canNext,
  busy,
  onPrev,
  onNext,
  onPageSizeChange,
  label = "Paginación de la tabla",
}: TablePagerProps) {
  if (total <= 0) return null;

  return (
    <nav className="hist-pager" aria-label={label}>
      <span className="hist-pager-meta muted">
        {from}–{to} de {total}
        {` · pág. ${page}/${Math.max(pages, 1)}`}
      </span>
      <div className="hist-pager-actions">
        <FilterSelect
          placeholder="Por pág."
          aria-label="Registros por página"
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v) || pageSize)}
          disabled={busy}
          required
          options={TABLE_PAGE_SIZES.map((n) => ({
            value: String(n),
            label: `${n} / pág.`,
          }))}
        />
        <button
          type="button"
          className="btn secondary btn-sm"
          disabled={!canPrev || busy}
          onClick={onPrev}
        >
          Anterior
        </button>
        <button
          type="button"
          className="btn secondary btn-sm"
          disabled={!canNext || busy}
          onClick={onNext}
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}
