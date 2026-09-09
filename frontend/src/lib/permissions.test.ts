import { describe, it, expect } from "vitest";
import {
  canCancelTransfer,
  canManageUsers,
  canWriteAssets,
  canWriteTransfer,
  canWriteWarehouse,
  roleLabel,
} from "./permissions";

describe("permissions", () => {
  it("operador_alta escribe activos pero no depósitos ni transferencias", () => {
    expect(canWriteAssets("operador_alta")).toBe(true);
    expect(canWriteWarehouse("operador_alta")).toBe(false);
    expect(canWriteTransfer("operador_alta")).toBe(false);
  });

  it("supervisor cancela transferencias pero no crea activos", () => {
    expect(canCancelTransfer("supervisor")).toBe(true);
    expect(canWriteAssets("supervisor")).toBe(false);
    expect(canWriteTransfer("supervisor")).toBe(false);
  });

  it("solo admin gestiona usuarios", () => {
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageUsers("supervisor")).toBe(false);
  });

  it("etiqueta roles legibles", () => {
    expect(roleLabel("operador_deposito")).toBe("Depósito");
    expect(roleLabel("admin")).toBe("Admin");
  });
});
