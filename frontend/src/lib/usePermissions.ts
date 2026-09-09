import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  canCancelTransfer,
  canManageRoles,
  canManageUsers,
  canWriteAssets,
  canWriteAssignment,
  canWriteTransfer,
  canWriteWarehouse,
  effectivePermissions,
  roleLabel,
} from "./permissions";

export function usePermissions() {
  const { user } = useAuth();
  const rol = user?.rol;
  const permisos = user?.permisos;

  return useMemo(() => {
    const list = effectivePermissions(permisos, rol);
    return {
      rol,
      roleLabel: roleLabel(rol),
      permisos: list,
      canWriteAssets: canWriteAssets(list, rol),
      canWriteAssignment: canWriteAssignment(list, rol),
      canWriteWarehouse: canWriteWarehouse(list, rol),
      canWriteTransfer: canWriteTransfer(list, rol),
      canCancelTransfer: canCancelTransfer(list, rol),
      canManageUsers: canManageUsers(list, rol),
      canManageRoles: canManageRoles(list, rol),
    };
  }, [rol, permisos]);
}
