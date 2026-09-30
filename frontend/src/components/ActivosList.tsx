import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Activo, UbicacionAsignada } from "../types";
import { useTablePaging } from "../lib/useTablePaging";
import EmptyState from "./EmptyState";
import TablePager from "./TablePager";

function formatUbicacion(ubicacion: UbicacionAsignada | null | undefined): string {
  if (!ubicacion) return "Sin ubicación";
  return `${ubicacion.deposito_nombre} / ${ubicacion.sector_nombre} / ${ubicacion.ubicacion_codigo}`;
}

interface ActivosListProps {
  activos: Activo[];
  ubicaciones: Record<string, UbicacionAsignada | null>;
  loading: boolean;
  viewingId?: string | null;
  editingId?: string | null;
  focusId?: string | null;
  onView: (activoId: string) => void;
  onEdit: (activoId: string) => void;
  onPrint: (activoId: string) => void;
  onDelete: (activoId: string) => void;
  onCreateRequest?: () => void;
  canWriteAssets?: boolean;
  /** Clave para resetear página al cambiar filtros. */
  filterKey?: string;
}

type MenuPos = { top: number; left: number; openUp: boolean };

export default function ActivosList({
  activos,
  ubicaciones,
  loading,
  viewingId = null,
  editingId = null,
  focusId = null,
  onView,
  onEdit,
  onPrint,
  onDelete,
  onCreateRequest,
  canWriteAssets = true,
  filterKey = "",
}: ActivosListProps) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);
  const paging = useTablePaging(activos, `${filterKey}|${activos.length}`);

  useEffect(() => {
    if (!focusId) return;
    focusRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusId, paging.pageIndex]);

  useEffect(() => {
    if (!focusId) return;
    const idx = activos.findIndex((a) => a.id === focusId);
    if (idx < 0) return;
    const targetPage = Math.floor(idx / Math.max(paging.pageSize, 1));
    if (targetPage !== paging.pageIndex) {
      paging.setPageIndex(targetPage);
    }
  }, [focusId, activos, paging.pageSize, paging.pageIndex, paging.setPageIndex]);

  const closeMenu = () => {
    setMenuId(null);
    setMenuPos(null);
    menuBtnRef.current = null;
  };

  useEffect(() => {
    if (!menuId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || menuBtnRef.current?.contains(t)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

  const toggleMenu = (id: string, btn: HTMLButtonElement) => {
    if (menuId === id) {
      closeMenu();
      return;
    }
    menuBtnRef.current = btn;
    const rect = btn.getBoundingClientRect();
    const panelH = 140;
    const openUp = rect.bottom + panelH > window.innerHeight - 8;
    setMenuPos({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: Math.min(rect.right, window.innerWidth - 8),
      openUp,
    });
    setMenuId(id);
  };

  useLayoutEffect(() => {
    if (!menuId || !menuPos || !menuRef.current) return;
    const panel = menuRef.current;
    const w = panel.offsetWidth;
    const left = Math.min(Math.max(8, menuPos.left - w), window.innerWidth - w - 8);
    if (Math.abs(left - panel.offsetLeft) > 1) {
      panel.style.left = `${left}px`;
    }
    if (menuPos.openUp) {
      panel.style.top = `${menuPos.top - panel.offsetHeight}px`;
    }
  }, [menuId, menuPos]);

  if (loading) {
    return (
      <p className="muted" aria-busy="true">
        Cargando…
      </p>
    );
  }

  if (activos.length === 0) {
    return (
      <EmptyState
        title="Sin artículos"
        description="Cargá el catálogo para empezar a etiquetar y ubicar activos."
        action={
          onCreateRequest ? (
            <button type="button" className="btn primary btn-sm" onClick={onCreateRequest}>
              + Nuevo artículo
            </button>
          ) : undefined
        }
      />
    );
  }

  const menuActivo = menuId ? activos.find((a) => a.id === menuId) : null;
  const pageActivos = paging.pageItems;

  return (
    <>
      <div ref={paging.viewportRef} className="table-wrap table-panel list-table-wrap">
        <table className="data-table dense sticky-head audit-table">
          <thead>
            <tr>
              <th>Patrimonio</th>
              <th className="col-hide-sm">Descripción</th>
              <th>Categoría</th>
              <th className="num">Stock</th>
              <th>Ubicación</th>
              <th>Estado</th>
              <th className="col-actions">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody key={`p-${paging.pageIndex}-s-${paging.pageSize}`} className="ui-enter">
            {pageActivos.map((activo) => {
              const ubicacion = ubicaciones[activo.id] ?? null;
              const isViewing = viewingId === activo.id;
              const isEditing = editingId === activo.id;
              const isFocused = focusId === activo.id;
              const rowActive = isViewing || isEditing || isFocused;
              const menuOpen = menuId === activo.id;

              return (
                <tr
                  key={activo.id}
                  ref={isFocused ? focusRowRef : undefined}
                  className={rowActive ? "row-active" : undefined}
                >
                  <td className="mono">{activo.numero_patrimonial}</td>
                  <td className="col-hide-sm">{activo.descripcion}</td>
                  <td>{activo.categoria.nombre}</td>
                  <td className="num">{activo.stock_etiquetas ?? 0}</td>
                  <td className={ubicacion ? undefined : "text-warn"}>{formatUbicacion(ubicacion)}</td>
                  <td>
                    <span className={`badge ${activo.activo ? "ok" : "warn"}`}>
                      {activo.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="col-actions">
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn primary btn-sm"
                        aria-pressed={isViewing}
                        onClick={() => onView(activo.id)}
                      >
                        Ver
                      </button>
                      {canWriteAssets && (
                        <div className="action-menu">
                          <button
                            type="button"
                            className="btn ghost btn-sm"
                            aria-expanded={menuOpen}
                            aria-haspopup="menu"
                            aria-label={`Más acciones de ${activo.numero_patrimonial}`}
                            onClick={(e) => toggleMenu(activo.id, e.currentTarget)}
                          >
                            ⋮
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {paging.total > 0 && (
        <TablePager
          from={paging.from}
          to={paging.to}
          total={paging.total}
          page={paging.pageIndex + 1}
          pages={paging.pages}
          pageSize={paging.pageSize}
          canPrev={paging.canPrev}
          canNext={paging.canNext}
          onPrev={paging.goPrev}
          onNext={paging.goNext}
          onPageSizeChange={paging.setPageSize}
          label="Paginación de artículos"
        />
      )}

      {menuActivo &&
        menuPos &&
        canWriteAssets &&
        createPortal(
          <div
            ref={menuRef}
            className={`action-menu-panel action-menu-portal ${menuPos.openUp ? "open-up" : ""}`}
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onEdit(menuActivo.id);
              }}
            >
              Editar
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onPrint(menuActivo.id);
              }}
            >
              Imprimir etiqueta
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger-text"
              onClick={() => {
                closeMenu();
                onDelete(menuActivo.id);
              }}
            >
              Eliminar
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
