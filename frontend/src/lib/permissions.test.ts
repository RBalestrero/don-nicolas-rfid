import { describe, it, expect } from "vitest";
import {
  canAuditInventory,
  canCancelTransfer,
  canManageRoles,
  canManageUsers,
  canWriteAssets,
  canWriteTransfer,
  canWriteWarehouse,
  roleLabel,
} from "./permissions";

describe("permissions", () => {
  it("operador_alta escribe activos pero no depósitos ni transferencias", () => {
    expect(canWriteAssets(undefined, "operador_alta")).toBe(true);
    expect(canWriteWarehouse(undefined, "operador_alta")).toBe(false);
    expect(canWriteTransfer(undefined, "operador_alta")).toBe(false);
  });

  it("supervisor cancela transferencias y audita inventarios, pero no crea activos", () => {
    expect(canCancelTransfer(undefined, "supervisor")).toBe(true);
    expect(canAuditInventory(undefined, "supervisor")).toBe(true);
    expect(canWriteAssets(undefined, "supervisor")).toBe(false);
    expect(canWriteTransfer(undefined, "supervisor")).toBe(false);
  });

  it("admin gestiona usuarios y roles", () => {
    expect(canManageUsers(undefined, "admin")).toBe(true);
    expect(canManageRoles(undefined, "admin")).toBe(true);
    expect(canManageUsers(undefined, "supervisor")).toBe(false);
  });

  it("respeta permisos explícitos del token", () => {
    expect(canWriteAssets(["assets.write"])).toBe(true);
    expect(canWriteWarehouse(["assets.write"])).toBe(false);
    expect(canManageUsers(["users.manage", "roles.manage"])).toBe(true);
  });

  it("etiqueta roles legibles", () => {
    expect(roleLabel("operador_deposito")).toBe("Depósito");
    expect(roleLabel("admin")).toBe("Admin");
  });
});
