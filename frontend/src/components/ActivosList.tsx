import { useEffect, useRef, useState } from "react";
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
  assigningId: string | null;
  editingId: string | null;
  historialId: string | null;
  fotosId: string | null;
  onAssign: (activoId: string) => void;
  onUnassign: (activoId: string) => void;
  onEdit: (activoId: string) => void;
  onHistorial: (activoId: string) => void;
  onFotos: (activoId: string) => void;
  onDeactivate: (activoId: string) => void;
  onCreateRequest?: () => void;
  canWriteAssets?: boolean;
  canWriteAssignment?: boolean;
}

export default function ActivosList({
  activos,
  ubicaciones,
  loading,
  assigningId,
  editingId,
  historialId,
  fotosId,
  onAssign,
  onUnassign,
  onEdit,
  onHistorial,
  onFotos,
  onDeactivate,
  onCreateRequest,
  canWriteAssets = true,
  canWriteAssignment = true,
}: ActivosListProps) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuId) return;
    const onDocClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuId(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuId]);

  if (loading) {
    return (
      <p className="muted" aria-busy="true" aria-live="polite">
        Cargando activos…
      </p>
    );
  }

  if (activos.length === 0) {
    return (
      <EmptyState
        title="Sin activos"
        description="Empezá por el maestro patrimonial para poder inventariar y transferir."
        steps={[
          "Creá categorías si hace falta",
          "Alta el activo con EPC si ya tiene etiqueta",
          "Asigná depósito / sector / ubicación",
        ]}
        action={
          onCreateRequest && canWriteAssets ? (
            <button type="button" className="btn primary btn-sm" onClick={onCreateRequest}>
              + Nuevo activo
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="table-wrap table-panel">
      <table className="data-table dense sticky-head">
        <thead>
          <tr>
            <th>Patrimonio</th>
            <th className="col-hide-sm">Descripción</th>
            <th>Categoría</th>
            <th>EPC</th>
            <th>Ubicación</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {activos.map((activo) => {
            const ubicacion = ubicaciones[activo.id] ?? null;
            const isAssigning = assigningId === activo.id;
            const isEditing = editingId === activo.id;
            const isHistorial = historialId === activo.id;
            const isFotos = fotosId === activo.id;
            const rowActive = isAssigning || isEditing || isHistorial || isFotos;
            const menuOpen = menuId === activo.id;

            return (
              <tr key={activo.id} className={rowActive ? "row-active" : undefined}>
                <td className="mono">{activo.numero_patrimonial}</td>
                <td className="col-hide-sm">{activo.descripcion}</td>
                <td>{activo.categoria.nombre}</td>
                <td className="mono">{activo.epc ?? "—"}</td>
                <td className={ubicacion ? undefined : "text-warn"}>{formatUbicacion(ubicacion)}</td>
                <td>
                  <span className={`badge ${activo.activo ? "ok" : "warn"}`}>
                    {activo.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    {canWriteAssets && (
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        aria-pressed={isEditing}
                        onClick={() => onEdit(activo.id)}
                      >
                        {isEditing ? "Cerrar" : "Editar"}
                      </button>
                    )}
                    {canWriteAssignment && (
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        aria-pressed={isAssigning}
                        onClick={() => onAssign(activo.id)}
                      >
                        {ubicacion
                          ? isAssigning
                            ? "Cerrar"
                            : "Ubicación"
                          : isAssigning
                            ? "Cerrar"
                            : "Asignar"}
                      </button>
                    )}
                    <div className="action-menu" ref={menuOpen ? menuRef : undefined}>
                      <button
                        type="button"
                        className="btn ghost btn-sm"
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        aria-label={`Más acciones de ${activo.numero_patrimonial}`}
                        onClick={() => setMenuId(menuOpen ? null : activo.id)}
                      >
                        Más
                      </button>
                      {menuOpen && (
                        <div className="action-menu-panel" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuId(null);
                              onFotos(activo.id);
                            }}
                          >
                            {isFotos ? "Cerrar fotos" : "Fotos"}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuId(null);
                              onHistorial(activo.id);
                            }}
                          >
                            {isHistorial ? "Cerrar historial" : "Historial"}
                          </button>
                          {canWriteAssignment && ubicacion && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuId(null);
                                onUnassign(activo.id);
                              }}
                            >
                              Quitar ubicación
                            </button>
                          )}
                          {canWriteAssets && activo.activo && (
                            <button
                              type="button"
                              role="menuitem"
                              className="danger"
                              onClick={() => {
                                setMenuId(null);
                                onDeactivate(activo.id);
                              }}
                            >
                              Dar de baja
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
