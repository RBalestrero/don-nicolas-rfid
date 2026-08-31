import { useEffect, useState } from "react";
import { useAuth } from "./context/AuthContext";
import ActivosPage from "./components/ActivosPage";
import LoginForm from "./components/LoginForm";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  database: string;
}

function HealthBadge() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        if (res.ok) setHealth(await res.json());
      } catch {
        setHealth(null);
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!health) return <span className="badge warn">API offline</span>;
  return (
    <span className={`badge ${health.status === "ok" ? "ok" : "warn"}`}>
      API {health.status} · DB {health.database}
    </span>
  );
}

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="app">
        <p className="muted center">Cargando...</p>
      </div>
    );
  }

  if (!user) {
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
          <LoginForm />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="logo">RFID</div>
        <div className="header-text">
          <h1>Don Nicolás</h1>
          <p>
            {user.nombre} · {user.rol}
          </p>
        </div>
        <div className="header-actions">
          <HealthBadge />
          <button type="button" className="btn secondary" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      <main className="main">
        <ActivosPage />
      </main>

      <footer className="footer">
        <span>Don Nicolás RFID — puerto 5174 (hot reload activo)</span>
      </footer>
    </div>
  );
}
