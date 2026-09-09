"""Roles y dependencias RBAC del sistema.

Roles sembrados (migración 001):
- admin: acceso total
- operador_deposito: depósitos, ubicaciones, inventarios (MC33), transferencias
- operador_alta: alta/edición de activos, categorías, fotos, etiquetas
- supervisor: lectura + cancelar transferencias / auditoría
"""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, Request, status

from app.config import get_settings
from app.dependencies import CLIENT_HEADER, get_current_user, require_roles
from app.modules.auth.models import Usuario

ROLE_ADMIN = "admin"
ROLE_OPERADOR_DEPOSITO = "operador_deposito"
ROLE_OPERADOR_ALTA = "operador_alta"
ROLE_SUPERVISOR = "supervisor"

ROLES_ASSETS_WRITE = (ROLE_ADMIN, ROLE_OPERADOR_ALTA, ROLE_OPERADOR_DEPOSITO)
ROLES_ASSIGNMENT_WRITE = (ROLE_ADMIN, ROLE_OPERADOR_ALTA, ROLE_OPERADOR_DEPOSITO)
ROLES_WAREHOUSE_WRITE = (ROLE_ADMIN, ROLE_OPERADOR_DEPOSITO)
ROLES_TRANSFER_WRITE = (ROLE_ADMIN, ROLE_OPERADOR_DEPOSITO)
ROLES_TRANSFER_CANCEL = (ROLE_ADMIN, ROLE_OPERADOR_DEPOSITO, ROLE_SUPERVISOR)
ROLES_INVENTORY_WRITE = (ROLE_ADMIN, ROLE_OPERADOR_DEPOSITO)

require_assets_write = require_roles(*ROLES_ASSETS_WRITE)
require_assignment_write = require_roles(*ROLES_ASSIGNMENT_WRITE)
require_warehouse_write = require_roles(*ROLES_WAREHOUSE_WRITE)
require_transfer_write = require_roles(*ROLES_TRANSFER_WRITE)
require_transfer_cancel = require_roles(*ROLES_TRANSFER_CANCEL)
require_admin = require_roles(ROLE_ADMIN)


def require_inventory_write(
    request: Request,
    current_user: Usuario = Depends(require_roles(*ROLES_INVENTORY_WRITE)),
    x_client: str | None = Header(default=None, alias=CLIENT_HEADER),
) -> Usuario:
    """Writes de inventario: rol operativo + cliente MC33."""
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
