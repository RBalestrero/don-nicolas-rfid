/** Permisos de UI alineados con backend/app/core/permissions.py */

export const PERM = {
  USERS_MANAGE: "users.manage",
  ROLES_MANAGE: "roles.manage",
  ASSETS_WRITE: "assets.write",
  ASSETS_ASSIGNMENT: "assets.assignment",
  WAREHOUSE_WRITE: "warehouse.write",
  TRANSFER_WRITE: "transfer.write",
  TRANSFER_CANCEL: "transfer.cancel",
  INVENTORY_WRITE: "inventory.write",
  INVENTORY_AUDIT: "inventory.audit",
} as const;

export type PermissionCode = (typeof PERM)[keyof typeof PERM];

export type AppRole = "admin" | "operador_deposito" | "operador_alta" | "supervisor" | string;

/** Fallback histórico si /me aún no trae permisos */
const ROLE_FALLBACK: Record<string, string[]> = {
  admin: Object.values(PERM),
  operador_deposito: [
    PERM.ASSETS_WRITE,
    PERM.ASSETS_ASSIGNMENT,
    PERM.WAREHOUSE_WRITE,
    PERM.TRANSFER_WRITE,
    PERM.TRANSFER_CANCEL,
    PERM.INVENTORY_WRITE,
    PERM.INVENTORY_AUDIT,
  ],
  operador_alta: [PERM.ASSETS_WRITE, PERM.ASSETS_ASSIGNMENT],
  supervisor: [PERM.TRANSFER_CANCEL, PERM.INVENTORY_AUDIT],
};

export function normalizeRole(rol: string | null | undefined): string {
  return (rol ?? "").trim().toLowerCase();
}

export function effectivePermissions(
  permisos: string[] | null | undefined,
  rol: string | null | undefined,
): string[] {
  // Solo fallback de rol si el backend no envió el campo (null/undefined).
  // `[]` es denegación explícita: no inventar permisos por nombre de rol.
  if (permisos != null) {
    return permisos.map((p) => p.toLowerCase());
  }
  return ROLE_FALLBACK[normalizeRole(rol)] ?? [];
}

export function hasPermission(
  permisos: string[] | null | undefined,
  code: string,
  rol?: string | null,
): boolean {
  return effectivePermissions(permisos, rol).includes(code.toLowerCase());
}

export function canWriteAssets(permisos?: string[] | null, rol?: string | null): boolean {
  return hasPermission(permisos, PERM.ASSETS_WRITE, rol);
}

export function canWriteAssignment(permisos?: string[] | null, rol?: string | null): boolean {
  return hasPermission(permisos, PERM.ASSETS_ASSIGNMENT, rol);
}

export function canWriteWarehouse(permisos?: string[] | null, rol?: string | null): boolean {
  return hasPermission(permisos, PERM.WAREHOUSE_WRITE, rol);
}

export function canWriteTransfer(permisos?: string[] | null, rol?: string | null): boolean {
  return hasPermission(permisos, PERM.TRANSFER_WRITE, rol);
}

export function canCancelTransfer(permisos?: string[] | null, rol?: string | null): boolean {
  return hasPermission(permisos, PERM.TRANSFER_CANCEL, rol);
}

export function canManageUsers(permisos?: string[] | null, rol?: string | null): boolean {
  return hasPermission(permisos, PERM.USERS_MANAGE, rol);
}

export function canManageRoles(permisos?: string[] | null, rol?: string | null): boolean {
  return hasPermission(permisos, PERM.ROLES_MANAGE, rol);
}

export function canAuditInventory(permisos?: string[] | null, rol?: string | null): boolean {
  return hasPermission(permisos, PERM.INVENTORY_AUDIT, rol);
}

export function roleLabel(rol: string | null | undefined): string {
  switch (normalizeRole(rol)) {
    case "admin":
      return "Admin";
    case "operador_deposito":
      return "Depósito";
    case "operador_alta":
      return "Alta";
    case "supervisor":
      return "Supervisor";
    default:
      return rol || "Usuario";
  }
}
