"""Auditoría web de inventarios cerrados

Revision ID: 010
Revises: 009
Create Date: 2026-09-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "010"
down_revision: str | None = "009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PERM_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0009"
PERM_CODE = "inventory.audit"

ROLE_IDS = (
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000002",
    "00000000-0000-0000-0000-000000000004",
)


def upgrade() -> None:
    op.add_column(
        "inventarios",
        sa.Column("auditado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "inventarios",
        sa.Column("auditado_en", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "inventarios",
        sa.Column("auditado_por_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "inventarios",
        sa.Column("comentario_auditoria", sa.Text(), nullable=True),
    )
    op.create_foreign_key(
        "fk_inventarios_auditado_por_id_usuarios",
        "inventarios",
        "usuarios",
        ["auditado_por_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_inventarios_auditado", "inventarios", ["auditado"])

    op.execute(
        sa.text(
            f"""
            INSERT INTO permisos (id, codigo, nombre, descripcion, modulo)
            VALUES (
              '{PERM_ID}',
              '{PERM_CODE}',
              'Auditar inventarios',
              'Marcar inventarios cerrados como auditados/vistos y corregidos desde la web',
              'inventarios'
            )
            ON CONFLICT (codigo) DO NOTHING
            """
        )
    )

    for role_id in ROLE_IDS:
        op.execute(
            sa.text(
                f"""
                INSERT INTO rol_permisos (rol_id, permiso_id)
                SELECT '{role_id}'::uuid, p.id
                FROM permisos p
                WHERE p.codigo = '{PERM_CODE}'
                  AND NOT EXISTS (
                    SELECT 1 FROM rol_permisos rp
                    WHERE rp.rol_id = '{role_id}'::uuid AND rp.permiso_id = p.id
                  )
                """
            )
        )


def downgrade() -> None:
    for role_id in ROLE_IDS:
        op.execute(
            sa.text(
                f"""
                DELETE FROM rol_permisos
                WHERE rol_id = '{role_id}'::uuid
                  AND permiso_id IN (SELECT id FROM permisos WHERE codigo = '{PERM_CODE}')
                """
            )
        )
    op.execute(sa.text(f"DELETE FROM permisos WHERE codigo = '{PERM_CODE}'"))

    op.drop_index("ix_inventarios_auditado", table_name="inventarios")
    op.drop_constraint("fk_inventarios_auditado_por_id_usuarios", "inventarios", type_="foreignkey")
    op.drop_column("inventarios", "comentario_auditoria")
    op.drop_column("inventarios", "auditado_por_id")
    op.drop_column("inventarios", "auditado_en")
    op.drop_column("inventarios", "auditado")
