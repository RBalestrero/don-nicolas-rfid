"""RBAC del sistema basado en permisos asignables a roles."""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, Request, status

from app.config import get_settings
from app.core.permissions import (
    PERM_ASSETS_ASSIGNMENT,
    PERM_ASSETS_WRITE,
    PERM_INVENTORY_WRITE,
    PERM_ROLES_MANAGE,
    PERM_TRANSFER_CANCEL,
    PERM_TRANSFER_WRITE,
    PERM_USERS_MANAGE,
    PERM_WAREHOUSE_WRITE,
)
from app.dependencies import CLIENT_HEADER, require_any_permission, require_permission
from app.modules.auth.models import Usuario

ROLE_ADMIN = "admin"
ROLE_OPERADOR_DEPOSITO = "operador_deposito"
ROLE_OPERADOR_ALTA = "operador_alta"
ROLE_SUPERVISOR = "supervisor"

require_assets_write = require_permission(PERM_ASSETS_WRITE)
require_assignment_write = require_permission(PERM_ASSETS_ASSIGNMENT)
require_warehouse_write = require_permission(PERM_WAREHOUSE_WRITE)
require_transfer_write = require_permission(PERM_TRANSFER_WRITE)
require_transfer_cancel = require_permission(PERM_TRANSFER_CANCEL)
require_users_manage = require_permission(PERM_USERS_MANAGE)
require_roles_manage = require_permission(PERM_ROLES_MANAGE)
require_users_or_roles_manage = require_any_permission(PERM_USERS_MANAGE, PERM_ROLES_MANAGE)
# Compat: "admin" ahora = permiso de gestionar usuarios
require_admin = require_users_manage


def require_inventory_write(
    request: Request,
    current_user: Usuario = Depends(require_permission(PERM_INVENTORY_WRITE)),
    x_client: str | None = Header(default=None, alias=CLIENT_HEADER),
) -> Usuario:
    """Writes de inventario: permiso operativo + cliente MC33."""
    settings = get_settings()
    client = (x_client or request.headers.get(CLIENT_HEADER) or "").strip().lower()
    if client not in settings.inventory_mobile_clients_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "INVENTORY_MOBILE_ONLY",
                "message": (
                    "El alta, las lecturas y el cierre de inventarios solo se permiten "
                    "desde la APK en el dispositivo MC33. Usá la web para auditar."
                ),
            },
        )
    return current_user
