import type { Activo, UbicacionAsignada } from "../types";

function formatUbicacion(ubicacion: UbicacionAsignada | null | undefined): string {
  if (!ubicacion) return "Sin ubicación";
  return `${ubicacion.deposito_nombre} / ${ubicacion.sector_nombre} / ${ubicacion.ubicacion_codigo}`;
}

interface ActivosListProps {
  activos: Activo[];
  ubicaciones: Record<string, UbicacionAsignada | null>;
  loading: boolean;
  assigningId: string | null;
  onAssign: (activoId: string) => void;
  onUnassign: (activoId: string) => void;
}

export default function ActivosList({
  activos,
  ubicaciones,
  loading,
  assigningId,
  onAssign,
  onUnassign,
}: ActivosListProps) {
  if (loading) {
    return <p className="muted">Cargando activos...</p>;
  }

  if (activos.length === 0) {
    return <p className="muted">No hay activos registrados. Creá el primero con el formulario.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Patrimonio</th>
            <th>Descripción</th>
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
            return (
              <tr key={activo.id} className={isAssigning ? "row-active" : undefined}>
                <td>{activo.numero_patrimonial}</td>
                <td>{activo.descripcion}</td>
                <td>{activo.categoria.nombre}</td>
                <td className="mono">{activo.epc ?? "—"}</td>
                <td>{formatUbicacion(ubicacion)}</td>
                <td>
                  <span className={`badge ${activo.activo ? "ok" : "warn"}`}>
                    {activo.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn secondary btn-sm"
                      onClick={() => onAssign(activo.id)}
                    >
                      {ubicacion ? (isAssigning ? "Cerrar" : "Cambiar") : isAssigning ? "Cerrar" : "Asignar"}
                    </button>
                    {ubicacion && (
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        onClick={() => onUnassign(activo.id)}
                      >
                        Quitar
                      </button>
                    )}
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
