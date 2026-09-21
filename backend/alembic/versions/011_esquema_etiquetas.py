"""Tabla etiquetas RFID (1 artículo/SKU → N unidades EPC)

Revision ID: 011
Revises: 010
Create Date: 2026-09-11

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "011"
down_revision: str | None = "010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "etiquetas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("activo_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("epc", sa.String(length=96), nullable=False),
        sa.Column("serial_hex", sa.String(length=12), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="activa"),
        sa.Column("impresa", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("impresa_en", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["activo_id"], ["activos.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("epc"),
    )
    op.create_index("ix_etiquetas_activo_id", "etiquetas", ["activo_id"])
    op.create_index("ix_etiquetas_epc", "etiquetas", ["epc"])
    op.create_index("ix_etiquetas_estado", "etiquetas", ["estado"])

    # Backfill: EPC legado en activos → una etiqueta activa
    op.execute(
        sa.text(
            """
            INSERT INTO etiquetas (id, activo_id, epc, serial_hex, estado, impresa, creado_en)
            SELECT gen_random_uuid(), a.id, UPPER(a.epc), NULL, 'activa', false, now()
            FROM activos a
            WHERE a.epc IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM etiquetas e WHERE e.epc = UPPER(a.epc)
              )
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_etiquetas_estado", table_name="etiquetas")
    op.drop_index("ix_etiquetas_epc", table_name="etiquetas")
    op.drop_index("ix_etiquetas_activo_id", table_name="etiquetas")
    op.drop_table("etiquetas")
