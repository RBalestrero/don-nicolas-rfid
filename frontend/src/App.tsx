import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  database: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${API_URL}/health`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: HealthResponse = await response.json();
        setHealth(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error de conexión");
        setHealth(null);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="logo">RFID</div>
        <div>
          <h1>Don Nicolás</h1>
          <p>Sistema de Gestión de Activos e Inventario</p>
        </div>
      </header>

      <main className="main">
        <section className="card">
          <h2>Estado del sistema</h2>
          {loading && <p className="muted">Conectando con la API...</p>}
          {error && <p className="error">API no disponible: {error}</p>}
          {health && (
            <dl className="status-grid">
              <div>
                <dt>Estado</dt>
                <dd className={health.status === "ok" ? "badge ok" : "badge warn"}>
                  {health.status}
                </dd>
              </div>
              <div>
                <dt>Servicio</dt>
                <dd>{health.service}</dd>
              </div>
              <div>
                <dt>Versión</dt>
                <dd>{health.version}</dd>
              </div>
              <div>
                <dt>Base de datos</dt>
                <dd className={health.database === "connected" ? "badge ok" : "badge warn"}>
                  {health.database}
                </dd>
              </div>
            </dl>
          )}
        </section>

        <section className="card modules">
          <h2>Módulos (próximamente)</h2>
          <ul>
            <li>Alta e Identificación de Activos</li>
            <li>Gestión de Depósitos</li>
            <li>Inventario Móvil</li>
            <li>Transferencias</li>
          </ul>
        </section>
      </main>

      <footer className="footer">
        <span>Hot reload activo — los cambios se reflejan al guardar</span>
      </footer>
    </div>
  );
}
