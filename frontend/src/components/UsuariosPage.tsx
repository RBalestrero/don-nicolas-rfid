import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { roleLabel } from "../lib/permissions";
import { usePermissions } from "../lib/usePermissions";
import type {
  PermisoCatalogo,
  RolCatalogo,
  RolCreatePayload,
  RolUpdatePayload,
  UsuarioAdmin,
  UsuarioCreatePayload,
  UsuarioUpdatePayload,
} from "../types";
import ConfirmDialog from "./ConfirmDialog";
import EmptyState from "./EmptyState";
import PageHeader from "./PageHeader";

type Tab = "usuarios" | "roles";

export default function UsuariosPage() {
  const toast = useToast();
  const perms = usePermissions();
  const [tab, setTab] = useState<Tab>(perms.canManageUsers ? "usuarios" : "roles");

  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [roles, setRoles] = useState<RolCatalogo[]>([]);
  const [permisosCat, setPermisosCat] = useState<PermisoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // users UI
  const [search, setSearch] = useState("");
  const [rolFilter, setRolFilter] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UsuarioAdmin | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<UsuarioAdmin | null>(null);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("operador_alta");

  // roles UI
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<RolCatalogo | null>(null);
  const [roleNombre, setRoleNombre] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [confirmDeleteRole, setConfirmDeleteRole] = useState<RolCatalogo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tasks: Promise<unknown>[] = [apiFetch<RolCatalogo[]>("/roles")];
      if (perms.canManageUsers) {
        tasks.push(apiFetch<UsuarioAdmin[]>("/usuarios?include_inactive=true"));
      }
      if (perms.canManageRoles) {
        tasks.push(apiFetch<PermisoCatalogo[]>("/permisos"));
      }
      const results = await Promise.all(tasks);
      setRoles(results[0] as RolCatalogo[]);
      let idx = 1;
      if (perms.canManageUsers) {
        setUsuarios(results[idx++] as UsuarioAdmin[]);
      }
      if (perms.canManageRoles) {
        setPermisosCat(results[idx] as PermisoCatalogo[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar administración");
    } finally {
      setLoading(false);
    }
  }, [perms.canManageUsers, perms.canManageRoles]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!perms.canManageUsers && tab === "usuarios") setTab("roles");
    if (!perms.canManageRoles && tab === "roles" && perms.canManageUsers) setTab("usuarios");
  }, [perms.canManageUsers, perms.canManageRoles, tab]);

  const roleNames = useMemo(() => roles.map((r) => r.nombre), [roles]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (soloActivos && !u.activo) return false;
      if (rolFilter && u.rol !== rolFilter) return false;
      if (!q) return true;
      return `${u.nombre} ${u.email} ${u.rol}`.toLowerCase().includes(q);
    });
  }, [usuarios, search, rolFilter, soloActivos]);

  const permisosPorModulo = useMemo(() => {
    const map = new Map<string, PermisoCatalogo[]>();
    for (const p of permisosCat) {
      const list = map.get(p.modulo) ?? [];
      list.push(p);
      map.set(p.modulo, list);
    }
    return [...map.entries()];
  }, [permisosCat]);

  const resetUserForm = () => {
    setNombre("");
    setEmail("");
    setPassword("");
    setRol(roleNames.includes("operador_alta") ? "operador_alta" : roleNames[0] ?? "admin");
    setEditingUser(null);
    setShowUserForm(false);
  };

  const openCreateUser = () => {
    setEditingUser(null);
    setNombre("");
    setEmail("");
    setPassword("");
    setRol(roleNames.includes("operador_alta") ? "operador_alta" : roleNames[0] ?? "admin");
    setShowUserForm(true);
  };

  const openEditUser = (user: UsuarioAdmin) => {
    setEditingUser(user);
    setNombre(user.nombre);
    setEmail(user.email);
    setPassword("");
    setRol(user.rol);
    setShowUserForm(true);
  };

  const handleUserSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editingUser) {
        const payload: UsuarioUpdatePayload = {
          nombre: nombre.trim(),
          email: email.trim(),
          rol,
        };
        if (password.trim()) payload.password = password;
        await apiFetch<UsuarioAdmin>(`/usuarios/${editingUser.id}`, {
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
      resetUserForm();
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

  const resetRoleForm = () => {
    setEditingRole(null);
    setRoleNombre("");
    setRoleDesc("");
    setRolePerms([]);
    setShowRoleForm(false);
  };

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleNombre("");
    setRoleDesc("");
    setRolePerms([]);
    setShowRoleForm(true);
  };

  const openEditRole = (role: RolCatalogo) => {
    setEditingRole(role);
    setRoleNombre(role.nombre);
    setRoleDesc(role.descripcion ?? "");
    setRolePerms([...(role.permisos ?? [])]);
    setShowRoleForm(true);
  };

  const toggleRolePerm = (codigo: string) => {
    setRolePerms((current) =>
      current.includes(codigo) ? current.filter((c) => c !== codigo) : [...current, codigo],
    );
  };

  const handleRoleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editingRole) {
        const payload: RolUpdatePayload = {
          descripcion: roleDesc.trim() || null,
          permisos: rolePerms,
        };
        if (!editingRole.es_sistema) {
          payload.nombre = roleNombre.trim();
        }
        await apiFetch<RolCatalogo>(`/roles/${editingRole.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Rol actualizado");
      } else {
        const payload: RolCreatePayload = {
          nombre: roleNombre.trim(),
          descripcion: roleDesc.trim() || null,
          permisos: rolePerms,
        };
        await apiFetch<RolCatalogo>("/roles", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Rol creado");
      }
      resetRoleForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar rol");
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteRoleAction = async () => {
    if (!confirmDeleteRole) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<void>(`/roles/${confirmDeleteRole.id}`, { method: "DELETE" });
      toast.success("Rol eliminado");
      setConfirmDeleteRole(null);
      if (editingRole?.id === confirmDeleteRole.id) resetRoleForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar rol");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Usuarios y roles"
        subtitle="Administrá operadores y los permisos de cada rol"
      >
        <button type="button" className="btn secondary" onClick={load} disabled={loading || busy}>
          Actualizar
        </button>
        {tab === "usuarios" && perms.canManageUsers && (
          <button
            type="button"
            className="btn primary"
            onClick={() => (showUserForm ? resetUserForm() : openCreateUser())}
          >
            {showUserForm ? "Cancelar" : "+ Nuevo usuario"}
          </button>
        )}
        {tab === "roles" && perms.canManageRoles && (
          <button
            type="button"
            className="btn primary"
            onClick={() => (showRoleForm ? resetRoleForm() : openCreateRole())}
          >
            {showRoleForm ? "Cancelar" : "+ Nuevo rol"}
          </button>
        )}
      </PageHeader>

      <div className="tabs" role="tablist" aria-label="Administración">
        {perms.canManageUsers && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "usuarios"}
            className={`tab ${tab === "usuarios" ? "active" : ""}`}
            onClick={() => setTab("usuarios")}
          >
            Usuarios
          </button>
        )}
        {perms.canManageRoles && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "roles"}
            className={`tab ${tab === "roles" ? "active" : ""}`}
            onClick={() => setTab("roles")}
          >
            Roles y permisos
          </button>
        )}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {tab === "usuarios" && perms.canManageUsers && (
        <>
          {showUserForm && (
            <section className="card panel-focus">
              <h3>{editingUser ? `Editar · ${editingUser.nombre}` : "Alta de usuario"}</h3>
              <form className="form" onSubmit={handleUserSubmit}>
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
                    <span>{editingUser ? "Nueva contraseña (opcional)" : "Contraseña"}</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required={!editingUser}
                      minLength={editingUser ? undefined : 6}
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
                  <button type="button" className="btn secondary" onClick={resetUserForm} disabled={busy}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn primary" disabled={busy}>
                    {busy ? "Guardando…" : editingUser ? "Guardar cambios" : "Crear usuario"}
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
                description="Creá operadores y asignales un rol con los permisos adecuados."
                action={
                  <button type="button" className="btn primary btn-sm" onClick={openCreateUser}>
                    + Nuevo usuario
                  </button>
                }
              />
            ) : filtrados.length === 0 ? (
              <EmptyState title="Sin coincidencias" description="Ningún usuario coincide con los filtros." />
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
                              onClick={() => openEditUser(u)}
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
        </>
      )}

      {tab === "roles" && perms.canManageRoles && (
        <>
          {showRoleForm && (
            <section className="card panel-focus">
              <h3>{editingRole ? `Editar rol · ${editingRole.nombre}` : "Nuevo rol"}</h3>
              <form className="form" onSubmit={handleRoleSubmit}>
                <div className="two-col">
                  <label className="field">
                    <span>Nombre técnico</span>
                    <input
                      value={roleNombre}
                      onChange={(e) => setRoleNombre(e.target.value)}
                      required
                      maxLength={50}
                      disabled={Boolean(editingRole?.es_sistema)}
                      placeholder="ej. auditor_planta"
                    />
                  </label>
                  <label className="field">
                    <span>Descripción</span>
                    <input
                      value={roleDesc}
                      onChange={(e) => setRoleDesc(e.target.value)}
                      maxLength={500}
                      placeholder="Para qué se usa este rol"
                    />
                  </label>
                </div>

                <div className="perm-matrix" role="group" aria-label="Permisos del rol">
                  <div className="section-header">
                    <h3>Permisos de acciones</h3>
                    <span className="muted">{rolePerms.length} seleccionados</span>
                  </div>
                  {permisosPorModulo.map(([modulo, items]) => (
                    <div key={modulo} className="perm-module">
                      <strong className="section-kicker">{modulo}</strong>
                      <ul className="perm-list">
                        {items.map((p) => (
                          <li key={p.id}>
                            <label className="field checkbox-field">
                              <input
                                type="checkbox"
                                checked={rolePerms.includes(p.codigo)}
                                onChange={() => toggleRolePerm(p.codigo)}
                              />
                              <span>
                                <strong>{p.nombre}</strong>
                                <span className="muted"> · {p.codigo}</span>
                                {p.descripcion && (
                                  <span className="perm-desc muted"> — {p.descripcion}</span>
                                )}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="form-actions">
                  <button type="button" className="btn secondary" onClick={resetRoleForm} disabled={busy}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn primary" disabled={busy}>
                    {busy ? "Guardando…" : editingRole ? "Guardar rol" : "Crear rol"}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="card">
            <div className="section-header">
              <h3>Roles</h3>
              <span className="muted">{roles.length} roles</span>
            </div>
            {loading ? (
              <p className="muted" aria-busy="true">
                Cargando…
              </p>
            ) : roles.length === 0 ? (
              <EmptyState
                title="Sin roles"
                description="Definí roles y asignales permisos de acciones del WMS."
                action={
                  <button type="button" className="btn primary btn-sm" onClick={openCreateRole}>
                    + Nuevo rol
                  </button>
                }
              />
            ) : (
              <div className="table-wrap table-panel">
                <table className="data-table dense sticky-head">
                  <thead>
                    <tr>
                      <th>Rol</th>
                      <th>Permisos</th>
                      <th className="num">Usuarios</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{roleLabel(r.nombre)}</strong>
                          <div className="muted mono">{r.nombre}</div>
                          {r.es_sistema && <span className="badge ok">Sistema</span>}
                          {r.descripcion && <div className="muted">{r.descripcion}</div>}
                        </td>
                        <td>
                          <div className="perm-chips">
                            {(r.permisos ?? []).length === 0 ? (
                              <span className="muted">Sin permisos</span>
                            ) : (
                              (r.permisos ?? []).map((code) => (
                                <span key={code} className="perm-chip mono">
                                  {code}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="num">{r.usuarios_count ?? 0}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn secondary btn-sm"
                              onClick={() => openEditRole(r)}
                              disabled={busy}
                            >
                              Editar
                            </button>
                            {!r.es_sistema && (
                              <button
                                type="button"
                                className="btn secondary btn-sm danger"
                                onClick={() => setConfirmDeleteRole(r)}
                                disabled={busy || (r.usuarios_count ?? 0) > 0}
                                title={
                                  (r.usuarios_count ?? 0) > 0
                                    ? "Reasigná usuarios antes de eliminar"
                                    : undefined
                                }
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

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

      <ConfirmDialog
        open={confirmDeleteRole !== null}
        title="Eliminar rol"
        description={
          confirmDeleteRole
            ? `Se eliminará el rol ${confirmDeleteRole.nombre}. Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Eliminar"
        danger
        busy={busy}
        onConfirm={confirmDeleteRoleAction}
        onCancel={() => setConfirmDeleteRole(null)}
      />
    </div>
  );
}
