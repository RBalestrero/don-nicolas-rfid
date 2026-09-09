/** Permisos de UI alineados con backend/app/core/rbac.py */

export type AppRole = "admin" | "operador_deposito" | "operador_alta" | "supervisor" | string;

const ASSETS_WRITE = new Set(["admin", "operador_alta", "operador_deposito"]);
const ASSIGNMENT_WRITE = new Set(["admin", "operador_alta", "operador_deposito"]);
const WAREHOUSE_WRITE = new Set(["admin", "operador_deposito"]);
const TRANSFER_WRITE = new Set(["admin", "operador_deposito"]);
const TRANSFER_CANCEL = new Set(["admin", "operador_deposito", "supervisor"]);

export function normalizeRole(rol: string | null | undefined): string {
  return (rol ?? "").trim().toLowerCase();
}

export function canWriteAssets(rol: string | null | undefined): boolean {
  return ASSETS_WRITE.has(normalizeRole(rol));
}

export function canWriteAssignment(rol: string | null | undefined): boolean {
  return ASSIGNMENT_WRITE.has(normalizeRole(rol));
}

export function canWriteWarehouse(rol: string | null | undefined): boolean {
  return WAREHOUSE_WRITE.has(normalizeRole(rol));
}

export function canWriteTransfer(rol: string | null | undefined): boolean {
  return TRANSFER_WRITE.has(normalizeRole(rol));
}

export function canCancelTransfer(rol: string | null | undefined): boolean {
  return TRANSFER_CANCEL.has(normalizeRole(rol));
}

export function canManageUsers(rol: string | null | undefined): boolean {
  return normalizeRole(rol) === "admin";
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
