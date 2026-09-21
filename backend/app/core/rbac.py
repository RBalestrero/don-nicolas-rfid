"""RBAC del sistema basado en permisos asignables a roles."""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, Request, status

from app.config import get_settings
from app.core.permissions import (
    PERM_ASSETS_ASSIGNMENT,
    PERM_ASSETS_WRITE,
    PERM_INVENTORY_AUDIT,
    PERM_INVENTORY_WRITE,
    PERM_ROLES_MANAGE,
    PERM_TRANSFER_CANCEL,
    PERM_TRANSFER_WRITE,
    PERM_USERS_MANAGE,
    PERM_WAREHOUSE_WRITE,
)
from app.dependencies import CLIENT_HEADER, get_current_user, require_any_permission, require_permission
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
require_inventory_audit = require_permission(PERM_INVENTORY_AUDIT)


INVENTORY_CLIENT_SECRET_HEADER = "X-Inventory-Client-Secret"


def require_mc33_client(
    request: Request,
    current_user: Usuario = Depends(get_current_user),
    x_client: str | None = Header(default=None, alias=CLIENT_HEADER),
    x_inventory_client_secret: str | None = Header(
        default=None, alias=INVENTORY_CLIENT_SECRET_HEADER
    ),
) -> Usuario:
    """Canal APK MC33: usuario autenticado + X-Client móvil (+ secret opcional)."""
    settings = get_settings()
    client = (x_client or request.headers.get(CLIENT_HEADER) or "").strip().lower()
    if client not in settings.inventory_mobile_clients_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "DEVICE_MOBILE_ONLY",
                "message": (
                    "El registro y la presencia de dispositivos solo se permiten "
                    "desde la APK en el dispositivo MC33."
                ),
            },
        )
    expected = (settings.inventory_client_secret or "").strip()
    if expected:
        provided = (x_inventory_client_secret or "").strip()
        if provided != expected:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INVENTORY_CLIENT_SECRET_INVALID",
                    "message": (
                        "Falta o es inválido el secreto de cliente MC33 "
                        f"({INVENTORY_CLIENT_SECRET_HEADER})."
                    ),
                },
            )
    return current_user


def require_inventory_write(
    request: Request,
    current_user: Usuario = Depends(require_permission(PERM_INVENTORY_WRITE)),
    x_client: str | None = Header(default=None, alias=CLIENT_HEADER),
    x_inventory_client_secret: str | None = Header(
        default=None, alias=INVENTORY_CLIENT_SECRET_HEADER
    ),
) -> Usuario:
    """Writes de inventario: permiso operativo + cliente MC33 (+ secret opcional)."""
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
    expected = (settings.inventory_client_secret or "").strip()
    if expected:
        provided = (x_inventory_client_secret or "").strip()
        if provided != expected:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INVENTORY_CLIENT_SECRET_INVALID",
                    "message": (
                        "Falta o es inválido el secreto de cliente MC33 "
                        f"({INVENTORY_CLIENT_SECRET_HEADER})."
                    ),
                },
            )
    return current_user


require_printer_manage = require_any_permission(PERM_USERS_MANAGE, PERM_ROLES_MANAGE)
require_printer_read = require_any_permission(
    PERM_ASSETS_WRITE,
    PERM_USERS_MANAGE,
    PERM_ROLES_MANAGE,
)
