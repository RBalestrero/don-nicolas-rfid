import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { roleLabel } from "../lib/permissions";
import type { RolCatalogo, UsuarioAdmin, UsuarioCreatePayload, UsuarioUpdatePayload } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import EmptyState from "./EmptyState";
import PageHeader from "./PageHeader";

const ROLE_OPTIONS_FALLBACK = [
  "admin",
  "operador_deposito",
  "operador_alta",
  "supervisor",
];

export default function UsuariosPage() {
  const toast = useToast();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [roles, setRoles] = useState<RolCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rolFilter, setRolFilter] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UsuarioAdmin | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState<UsuarioAdmin | null>(null);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("operador_alta");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, rolesData] = await Promise.all([
        apiFetch<UsuarioAdmin[]>("/usuarios?include_inactive=true"),
        apiFetch<RolCatalogo[]>("/roles"),
      ]);
      setUsuarios(usersData);
      setRoles(rolesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const roleNames = useMemo(
    () => (roles.length > 0 ? roles.map((r) => r.nombre) : ROLE_OPTIONS_FALLBACK),
    [roles],
  );

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (soloActivos && !u.activo) return false;
      if (rolFilter && u.rol !== rolFilter) return false;
      if (!q) return true;
      return `${u.nombre} ${u.email} ${u.rol}`.toLowerCase().includes(q);
    });
  }, [usuarios, search, rolFilter, soloActivos]);

  const resetForm = () => {
    setNombre("");
    setEmail("");
    setPassword("");
    setRol(roleNames.includes("operador_alta") ? "operador_alta" : roleNames[0] ?? "admin");
    setEditing(null);
    setShowForm(false);
  };

  const openCreate = () => {
    setEditing(null);
    setNombre("");
    setEmail("");
    setPassword("");
    setRol(roleNames.includes("operador_alta") ? "operador_alta" : roleNames[0] ?? "admin");
    setShowForm(true);
  };

  const openEdit = (user: UsuarioAdmin) => {
    setEditing(user);
    setNombre(user.nombre);
    setEmail(user.email);
    setPassword("");
    setRol(user.rol);
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        const payload: UsuarioUpdatePayload = {
          nombre: nombre.trim(),
          email: email.trim(),
          rol,
        };
        if (password.trim()) payload.password = password;
        await apiFetch<UsuarioAdmin>(`/usuarios/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Usuario actualizado");
      } else {
        const payload: UsuarioCreatePayload = {
          nombre: nombre.trim(),
          email: email.trim(),
          password,
          rol,
          activo: true,
        };
        await apiFetch<UsuarioAdmin>("/usuarios", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Usuario creado");
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar usuario");
    } finally {
      setBusy(false);
    }
  };

  const confirmToggleActivo = async () => {
    if (!confirmToggle) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<UsuarioAdmin>(`/usuarios/${confirmToggle.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !confirmToggle.activo }),
      });
      toast.success(confirmToggle.activo ? "Usuario desactivado" : "Usuario reactivado");
      setConfirmToggle(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cambiar estado");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Usuarios"
        subtitle="Alta, roles y activación de operadores del WMS"
      >
        <button type="button" className="btn secondary" onClick={load} disabled={loading || busy}>
          Actualizar
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => (showForm ? resetForm() : openCreate())}
        >
          {showForm ? "Cancelar" : "+ Nuevo usuario"}
        </button>
      </PageHeader>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <section className="card panel-focus">
          <h3>{editing ? `Editar · ${editing.nombre}` : "Alta de usuario"}</h3>
          <form className="form" onSubmit={handleSubmit}>
            <div className="two-col">
              <label className="field">
                <span>Nombre</span>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                  maxLength={100}
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={254}
                />
              </label>
            </div>
            <div className="two-col">
              <label className="field">
                <span>{editing ? "Nueva contraseña (opcional)" : "Contraseña"}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!editing}
                  minLength={editing ? undefined : 6}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <label className="field">
                <span>Rol</span>
                <select value={rol} onChange={(e) => setRol(e.target.value)} required>
                  {roleNames.map((name) => (
                    <option key={name} value={name}>
                      {roleLabel(name)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn secondary" onClick={resetForm} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear usuario"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <div className="section-header">
          <h3>Listado</h3>
          <span className="muted">
            {filtrados.length}
            {filtrados.length !== usuarios.length ? ` / ${usuarios.length}` : ""} usuarios
          </span>
        </div>

        {usuarios.length > 0 && (
          <div className="toolbar" role="search" aria-label="Filtrar usuarios">
            <label className="field toolbar-field grow">
              <span>Buscar</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre, email o rol"
              />
            </label>
            <label className="field toolbar-field">
              <span>Rol</span>
              <select value={rolFilter} onChange={(e) => setRolFilter(e.target.value)}>
                <option value="">Todos</option>
                {roleNames.map((name) => (
                  <option key={name} value={name}>
                    {roleLabel(name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field toolbar-field checkbox-field toolbar-check">
              <input
                type="checkbox"
                checked={soloActivos}
                onChange={(e) => setSoloActivos(e.target.checked)}
              />
              <span>Solo activos</span>
            </label>
          </div>
        )}

        {loading ? (
          <p className="muted" aria-busy="true">
            Cargando…
          </p>
        ) : usuarios.length === 0 ? (
          <EmptyState
            title="Sin usuarios"
            description="Creá operadores con roles para separar alta, depósito y supervisión."
            action={
              <button type="button" className="btn primary btn-sm" onClick={openCreate}>
                + Nuevo usuario
              </button>
            }
          />
        ) : filtrados.length === 0 ? (
          <EmptyState
            title="Sin coincidencias"
            description="Ningún usuario coincide con los filtros."
            action={
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={() => {
                  setSearch("");
                  setRolFilter("");
                  setSoloActivos(false);
                }}
              >
                Limpiar filtros
              </button>
            }
          />
        ) : (
          <div className="table-wrap table-panel">
            <table className="data-table dense sticky-head">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((u) => (
                  <tr key={u.id} className={u.activo ? undefined : "row-warn"}>
                    <td>
                      <strong>{u.nombre}</strong>
                    </td>
                    <td className="mono">{u.email}</td>
                    <td>
                      <span className="role-badge">{roleLabel(u.rol)}</span>
                    </td>
                    <td>
                      <span className={`badge ${u.activo ? "ok" : "warn"}`}>
                        {u.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn secondary btn-sm"
                          onClick={() => openEdit(u)}
                          disabled={busy}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${u.activo ? "secondary danger" : "primary"}`}
                          onClick={() => setConfirmToggle(u)}
                          disabled={busy}
                        >
                          {u.activo ? "Desactivar" : "Reactivar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmToggle !== null}
        title={confirmToggle?.activo ? "Desactivar usuario" : "Reactivar usuario"}
        description={
          confirmToggle
            ? confirmToggle.activo
              ? `${confirmToggle.nombre} no podrá iniciar sesión hasta reactivarlo.`
              : `${confirmToggle.nombre} volverá a poder iniciar sesión.`
            : undefined
        }
        confirmLabel={confirmToggle?.activo ? "Desactivar" : "Reactivar"}
        danger={Boolean(confirmToggle?.activo)}
        busy={busy}
        onConfirm={confirmToggleActivo}
        onCancel={() => setConfirmToggle(null)}
      />
    </div>
  );
}
