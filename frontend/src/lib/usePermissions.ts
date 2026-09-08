import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  canCancelTransfer,
  canWriteAssets,
  canWriteAssignment,
  canWriteTransfer,
  canWriteWarehouse,
  roleLabel,
} from "./permissions";

export function usePermissions() {
  const { user } = useAuth();
  const rol = user?.rol;

  return useMemo(
    () => ({
      rol,
      roleLabel: roleLabel(rol),
      canWriteAssets: canWriteAssets(rol),
      canWriteAssignment: canWriteAssignment(rol),
      canWriteWarehouse: canWriteWarehouse(rol),
      canWriteTransfer: canWriteTransfer(rol),
      canCancelTransfer: canCancelTransfer(rol),
    }),
    [rol],
  );
}
