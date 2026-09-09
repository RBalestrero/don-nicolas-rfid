"""Códigos de permiso de acciones del sistema."""

PERM_USERS_MANAGE = "users.manage"
PERM_ROLES_MANAGE = "roles.manage"
PERM_ASSETS_WRITE = "assets.write"
PERM_ASSETS_ASSIGNMENT = "assets.assignment"
PERM_WAREHOUSE_WRITE = "warehouse.write"
PERM_TRANSFER_WRITE = "transfer.write"
PERM_TRANSFER_CANCEL = "transfer.cancel"
PERM_INVENTORY_WRITE = "inventory.write"

ALL_PERMISSION_CODES = (
    PERM_USERS_MANAGE,
    PERM_ROLES_MANAGE,
    PERM_ASSETS_WRITE,
    PERM_ASSETS_ASSIGNMENT,
    PERM_WAREHOUSE_WRITE,
    PERM_TRANSFER_WRITE,
    PERM_TRANSFER_CANCEL,
    PERM_INVENTORY_WRITE,
)
