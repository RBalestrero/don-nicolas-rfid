import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Activo, UbicacionAsignada } from "../types";
import EmptyState from "./EmptyState";

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
}: ActivosListProps) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);

  const closeMenu = () => {
    setMenuId(null);
    setMenuPos(null);
    menuBtnRef.current = null;
  };

  const updateMenuPos = (btn: HTMLElement) => {
    const rect = btn.getBoundingClientRect();
    const panelH = 160;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < panelH && rect.top > panelH;
    setMenuPos({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: Math.min(rect.right, window.innerWidth - 12),
      openUp,
    });
  };

  const toggleMenu = (activoId: string, btn: HTMLButtonElement) => {
    if (menuId === activoId) {
      closeMenu();
      return;
    }
    menuBtnRef.current = btn;
    updateMenuPos(btn);
    setMenuId(activoId);
  };

  useEffect(() => {
    if (!menuId) return;
    const onDocClick = (event: MouseEvent) => {
      const t = event.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (menuBtnRef.current?.contains(t)) return;
      closeMenu();
    };
    const onReposition = () => {
      if (menuBtnRef.current) updateMenuPos(menuBtnRef.current);
    };
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("resize", onReposition);
    const scrollRoot = menuBtnRef.current?.closest(".table-wrap, .table-panel");
    scrollRoot?.addEventListener("scroll", closeMenu, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("resize", onReposition);
      scrollRoot?.removeEventListener("scroll", closeMenu, true);
    };
  }, [menuId]);

  useLayoutEffect(() => {
    if (!menuId || !menuBtnRef.current) return;
    updateMenuPos(menuBtnRef.current);
  }, [menuId]);

  useEffect(() => {
    if (!focusId || !focusRowRef.current) return;
    focusRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusId, activos]);

  if (loading) {
    return (
      <p className="muted" aria-busy="true" aria-live="polite">
        Cargando artículos…
      </p>
    );
  }

  if (activos.length === 0) {
    return (
      <EmptyState
        title="Sin artículos"
        description="Empezá por el maestro patrimonial para poder inventariar y transferir."
        steps={[
          "Alta el artículo (SKU)",
          "Generá unidades RFID en Etiquetas",
          "Asigná depósito / sector / ubicación",
        ]}
        action={
          onCreateRequest && canWriteAssets ? (
            <button type="button" className="btn primary btn-sm" onClick={onCreateRequest}>
              + Nuevo artículo
            </button>
          ) : undefined
        }
      />
    );
  }

  const menuActivo = menuId ? activos.find((a) => a.id === menuId) : null;

  return (
    <div className="table-wrap table-panel">
      <table className="data-table dense sticky-head">
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
        <tbody>
          {activos.map((activo) => {
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
              className="danger"
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
    </div>
  );
}
