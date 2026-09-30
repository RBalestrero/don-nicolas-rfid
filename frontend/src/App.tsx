import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useAuth } from "./context/AuthContext";
import ActivosPage from "./components/ActivosPage";
import AttentionDock from "./components/AttentionDock";
import DashboardPage from "./components/DashboardPage";
import type { AppPage } from "./lib/appPages";
import { signalSessionNav } from "./lib/attentionItems";
import { writeOpsTableTab } from "./components/OpsTableTabs";
import UsuariosPage, { writeUsersTab } from "./components/UsuariosPage";
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

const PAGE_CHROME: Record<AppPage, { title: string; subtitle: string }> = {
  dashboard: { title: "Operaciones", subtitle: "Qué necesita tu atención hoy" },
  inventarios: {
    title: "Operaciones",
    subtitle: "Inventarios · auditoría MC33",
  },
  transferencias: {
    title: "Operaciones",
    subtitle: "Movimientos entre depósitos y entregas",
  },
  activos: { title: "Artículos", subtitle: "Catálogo, categorías y depósitos" },
  depositos: {
    title: "Artículos",
    subtitle: "Catálogo, categorías y depósitos",
  },
  usuarios: {
    title: "Configuración",
    subtitle: "Usuarios y roles",
  },
  roles: {
    title: "Configuración",
    subtitle: "Usuarios y roles",
  },
};

function HealthBadge() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        if (res.ok) setHealth(await res.json());
        else setHealth(null);
      } catch {
        setHealth(null);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!health) {
    return <span className="badge warn" title="API offline">API offline</span>;
  }
  if (health.status !== "ok") {
    return <span className="badge warn">Degradado</span>;
  }
  return (
    <span
      className="health-dot ok"
      title="Sistema OK"
      aria-label="Sistema operativo"
    />
  );
}

function AppNavMenu({
  page,
  showConfig,
  onNavigate,
}: {
  page: AppPage;
  showConfig: boolean;
  onNavigate: (page: AppPage) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = useMemo(() => {
    const list: { id: AppPage; label: string; active: boolean }[] = [
      {
        id: "dashboard",
        label: "Operaciones",
        active: page === "dashboard" || page === "inventarios" || page === "transferencias",
      },
      {
        id: "activos",
        label: "Artículos",
        active: page === "activos" || page === "depositos",
      },
    ];
    if (showConfig) {
      list.push({
        id: "usuarios",
        label: "Configuración",
        active: page === "usuarios" || page === "roles",
      });
    }
    return list;
  }, [page, showConfig]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="app-nav-menu" ref={rootRef}>
      <button
        type="button"
        className={`app-nav-trigger${open ? " is-open" : ""}`}
        aria-label={open ? "Cerrar navegación" : "Abrir navegación"}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="app-nav-icon" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>
      {open && (
        <div className="app-nav-panel" role="menu" id={menuId} aria-label="Navegación principal">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`app-nav-item${item.active ? " is-active" : ""}`}
              aria-current={item.active ? "page" : undefined}
              onClick={() => {
                setOpen(false);
                onNavigate(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const [page, setPage] = useState<AppPage>("dashboard");
  const [attnMobileOpen, setAttnMobileOpen] = useState(false);
  const [attnCount, setAttnCount] = useState(0);
  const onAttnCountChange = useCallback((n: number) => setAttnCount(n), []);
  const navigate = useCallback((next: AppPage) => {
    if (next === "inventarios") {
      writeOpsTableTab("inventarios");
      signalSessionNav();
      setPage("dashboard");
      return;
    }
    if (next === "transferencias") {
      writeOpsTableTab("movimientos");
      signalSessionNav();
      setPage("dashboard");
      return;
    }
    if (next === "depositos") {
      setPage("activos");
      return;
    }
    if (next === "roles") {
      writeUsersTab("roles");
      setPage("usuarios");
      return;
    }
    setPage(next);
  }, []);
  const canUsers = canManageUsers(user?.permisos, user?.rol);
  const canRoles = canManageRoles(user?.permisos, user?.rol);
  const showConfig = canUsers || canRoles;

  useEffect(() => {
    if (page === "roles") {
      writeUsersTab("roles");
      setPage("usuarios");
      return;
    }
    if (page === "usuarios" && !showConfig) setPage("dashboard");
  }, [showConfig, page]);

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
              <p className="muted">WMS · Artículos RFID</p>
            </div>
          </div>
        </header>
        <main className="login-main">
          <LoginForm />
        </main>
      </div>
    );
  }

  const chrome = PAGE_CHROME[page];

  return (
    <div className="app-shell">
      <header className="topbar" aria-label="Barra de aplicación">
        <div className="brand">
          <div className="logo">DN</div>
          <div className="brand-text">
            <strong>Don Nicolás</strong>
            <span className="muted">WMS</span>
          </div>
        </div>
        <div className="topbar-page">
          <AppNavMenu page={page} showConfig={showConfig} onNavigate={navigate} />
          <div className="topbar-page-text">
            <h1 className="topbar-page-title">{chrome.title}</h1>
            <p className="topbar-page-subtitle">{chrome.subtitle}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="btn secondary btn-sm attn-topbar-btn"
            aria-label={
              attnCount > 0
                ? `Requiere atención, ${attnCount} pendiente${attnCount === 1 ? "" : "s"}`
                : "Requiere atención"
            }
            onClick={() => setAttnMobileOpen(true)}
          >
            Atención
            {attnCount > 0 ? (
              <span className="attn-topbar-count">{attnCount}</span>
            ) : null}
          </button>
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
        <main
          className={[
            "workspace",
            page === "dashboard" ? "workspace-ops" : "",
            page === "activos" ? "workspace-activos" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {page === "dashboard" && <DashboardPage onNavigate={navigate} />}
          {page === "activos" && <ActivosPage onNavigate={navigate} />}
          {page === "usuarios" && showConfig && <UsuariosPage />}
        </main>

        <AttentionDock
          onNavigate={navigate}
          onCountChange={onAttnCountChange}
          mobileOpen={attnMobileOpen}
          onMobileOpenChange={setAttnMobileOpen}
        />
      </div>
    </div>
  );
}
