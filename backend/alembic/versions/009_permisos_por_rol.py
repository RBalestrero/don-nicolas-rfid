"""Permisos por rol + catálogo de acciones

Revision ID: 009
Revises: 008
Create Date: 2026-09-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PERMISOS = [
    ("users.manage", "Gestionar usuarios", "Alta, edición y activación de usuarios", "admin"),
    ("roles.manage", "Gestionar roles", "Crear, editar, eliminar roles y asignar permisos", "admin"),
    ("assets.write", "Escribir activos", "Alta/edición/baja de activos, categorías, fotos y etiquetas", "activos"),
    ("assets.assignment", "Asignar ubicación", "Asignar o quitar ubicación de activos", "activos"),
    ("warehouse.write", "Escribir depósitos", "Alta de depósitos, sectores y ubicaciones", "depositos"),
    ("transfer.write", "Escribir transferencias", "Crear y confirmar transferencias entre depósitos", "transferencias"),
    ("transfer.cancel", "Cancelar transferencias", "Cancelar órdenes de transferencia", "transferencias"),
    ("inventory.write", "Operar inventarios MC33", "Iniciar, leer y cerrar inventarios desde la APK", "inventarios"),
]

# role id -> permission codes (matching historical RBAC)
ROLE_PERMS = {
    "00000000-0000-0000-0000-000000000001": [p[0] for p in PERMISOS],  # admin: all
    "00000000-0000-0000-0000-000000000002": [  # operador_deposito
        "assets.write",
        "assets.assignment",
        "warehouse.write",
        "transfer.write",
        "transfer.cancel",
        "inventory.write",
    ],
    "00000000-0000-0000-0000-000000000003": [  # operador_alta
        "assets.write",
        "assets.assignment",
    ],
    "00000000-0000-0000-0000-000000000004": [  # supervisor
        "transfer.cancel",
    ],
}


def upgrade() -> None:
    op.add_column(
        "roles",
        sa.Column("es_sistema", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.execute(
        sa.text(
            "UPDATE roles SET es_sistema = true WHERE id IN ("
            "'00000000-0000-0000-0000-000000000001',"
            "'00000000-0000-0000-0000-000000000002',"
            "'00000000-0000-0000-0000-000000000003',"
            "'00000000-0000-0000-0000-000000000004'"
            ")"
        )
    )

    op.create_table(
        "permisos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("codigo", sa.String(80), nullable=False),
        sa.Column("nombre", sa.String(120), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("modulo", sa.String(50), nullable=False),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("codigo", name="uq_permisos_codigo"),
    )
    op.create_index("ix_permisos_codigo", "permisos", ["codigo"])

    op.create_table(
        "rol_permisos",
        sa.Column("rol_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "permiso_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("permisos.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    permisos_t = sa.table(
        "permisos",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("codigo", sa.String),
        sa.column("nombre", sa.String),
        sa.column("descripcion", sa.Text),
        sa.column("modulo", sa.String),
    )
    import uuid

    codigo_to_id: dict[str, str] = {}
    rows = []
    for codigo, nombre, descripcion, modulo in PERMISOS:
        pid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"donnicolas.permiso.{codigo}"))
        codigo_to_id[codigo] = pid
        rows.append(
            {
                "id": pid,
                "codigo": codigo,
                "nombre": nombre,
                "descripcion": descripcion,
                "modulo": modulo,
            }
        )
    op.bulk_insert(permisos_t, rows)

    rol_permisos_t = sa.table(
        "rol_permisos",
        sa.column("rol_id", postgresql.UUID(as_uuid=True)),
        sa.column("permiso_id", postgresql.UUID(as_uuid=True)),
    )
    rp_rows = []
    for rol_id, codes in ROLE_PERMS.items():
        for code in codes:
            rp_rows.append({"rol_id": rol_id, "permiso_id": codigo_to_id[code]})
    op.bulk_insert(rol_permisos_t, rp_rows)


def downgrade() -> None:
    op.drop_table("rol_permisos")
    op.drop_index("ix_permisos_codigo", table_name="permisos")
    op.drop_table("permisos")
    op.drop_column("roles", "es_sistema")
