import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./context/AuthContext";
import ActivosPage from "./components/ActivosPage";
import DashboardPage, { type AppPage } from "./components/DashboardPage";
import DepositosPage from "./components/DepositosPage";
import InventariosPage from "./components/InventariosPage";
import TransferenciasPage from "./components/TransferenciasPage";
import UsuariosPage from "./components/UsuariosPage";
import LoginForm from "./components/LoginForm";
import { canManageRoles, canManageUsers, roleLabel } from "./lib/permissions";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  database: string;
}

const NAV_OPERACION: { id: AppPage; label: string }[] = [
  { id: "dashboard", label: "Operaciones" },
  { id: "inventarios", label: "Inventarios" },
  { id: "transferencias", label: "Transferencias" },
];

const NAV_MAESTROS: { id: AppPage; label: string }[] = [
  { id: "activos", label: "Activos" },
  { id: "depositos", label: "Depósitos" },
];

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
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!health) return <span className="badge warn">API offline</span>;
  return (
    <span className={`badge ${health.status === "ok" ? "ok" : "warn"}`}>
      {health.status === "ok" ? "Sistema OK" : "Degradado"}
    </span>
  );
}

function NavButton({
  id,
  label,
  active,
  onSelect,
}: {
  id: AppPage;
  label: string;
  active: boolean;
  onSelect: (page: AppPage) => void;
}) {
  return (
    <button
      type="button"
      className={`nav-item ${active ? "active" : ""}`}
      onClick={(e) => {
        onSelect(id);
        e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      }}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </button>
  );
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const [page, setPage] = useState<AppPage>("dashboard");
  const showUsuarios = canManageUsers(user?.permisos, user?.rol) || canManageRoles(user?.permisos, user?.rol);

  const navAdmin = useMemo(
    () => (showUsuarios ? ([{ id: "usuarios" as AppPage, label: "Usuarios" }] as const) : []),
    [showUsuarios],
  );

  useEffect(() => {
    if (!showUsuarios && page === "usuarios") setPage("dashboard");
  }, [showUsuarios, page]);

  if (loading) {
    return (
      <div className="app-shell login-shell">
        <p className="muted center">Cargando…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell login-shell">
        <header className="topbar login-topbar">
          <div className="brand">
            <div className="logo">DN</div>
            <div>
              <strong>Don Nicolás</strong>
              <p className="muted">WMS · Activos RFID</p>
            </div>
          </div>
        </header>
        <main className="login-main">
          <LoginForm />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo">DN</div>
          <div className="brand-text">
            <strong>Don Nicolás</strong>
            <span className="muted">WMS</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="user-chip muted" title={`${user.nombre} · ${user.rol}`}>
            <span className="user-chip-name">{user.nombre}</span>
            <span className="role-badge">{roleLabel(user.rol)}</span>
          </span>
          <HealthBadge />
          <button type="button" className="btn secondary btn-sm" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      <div className="shell-body">
        <nav className="side-nav" aria-label="Navegación principal">
          <div className="nav-scroll">
            <div className="nav-group">
              <span className="nav-group-label">Operación</span>
              {NAV_OPERACION.map((item) => (
                <NavButton
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  active={page === item.id}
                  onSelect={setPage}
                />
              ))}
            </div>
            <div className="nav-group">
              <span className="nav-group-label">Maestros</span>
              {NAV_MAESTROS.map((item) => (
                <NavButton
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  active={page === item.id}
                  onSelect={setPage}
                />
              ))}
            </div>
            {navAdmin.length > 0 && (
              <div className="nav-group">
                <span className="nav-group-label">Admin</span>
                {navAdmin.map((item) => (
                  <NavButton
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    active={page === item.id}
                    onSelect={setPage}
                  />
                ))}
              </div>
            )}
          </div>
        </nav>

        <main className="workspace">
          {page === "dashboard" && <DashboardPage onNavigate={setPage} />}
          {page === "activos" && <ActivosPage />}
          {page === "depositos" && <DepositosPage />}
          {page === "inventarios" && <InventariosPage />}
          {page === "transferencias" && <TransferenciasPage />}
          {page === "usuarios" && showUsuarios && <UsuariosPage />}
        </main>
      </div>
    </div>
  );
}
