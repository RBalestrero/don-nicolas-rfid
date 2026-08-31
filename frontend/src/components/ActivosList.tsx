import type { Activo } from "../types";

interface ActivosListProps {
  activos: Activo[];
  loading: boolean;
}

export default function ActivosList({ activos, loading }: ActivosListProps) {
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
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {activos.map((activo) => (
            <tr key={activo.id}>
              <td>{activo.numero_patrimonial}</td>
              <td>{activo.descripcion}</td>
              <td>{activo.categoria.nombre}</td>
              <td className="mono">{activo.epc ?? "—"}</td>
              <td>
                <span className={`badge ${activo.activo ? "ok" : "warn"}`}>
                  {activo.activo ? "Activo" : "Inactivo"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
