"""Sesiones de inventario masivo

Revision ID: 007
Revises: 006
Create Date: 2026-09-07

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "inventarios",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "deposito_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("depositos.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "sector_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sectores.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "ubicacion_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ubicaciones.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "usuario_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("usuarios.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("estado", sa.String(20), nullable=False, server_default="en_curso"),
        sa.Column("total_esperado", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_encontrado", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_faltante", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_sobrante", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "iniciado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("cerrado_en", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_inventarios_deposito_id", "inventarios", ["deposito_id"])
    op.create_index("ix_inventarios_estado", "inventarios", ["estado"])

    op.create_table(
        "detalle_inventario",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "inventario_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inventarios.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "activo_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("activos.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("epc", sa.String(96), nullable=True),
        sa.Column("numero_patrimonial", sa.String(50), nullable=True),
        sa.Column("descripcion", sa.String(255), nullable=True),
        sa.Column("estado", sa.String(20), nullable=False, server_default="esperado"),
        sa.Column("leido_en", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_detalle_inventario_inventario_id", "detalle_inventario", ["inventario_id"])
    op.create_index("ix_detalle_inventario_epc", "detalle_inventario", ["epc"])
    op.create_index("ix_detalle_inventario_estado", "detalle_inventario", ["estado"])


def downgrade() -> None:
    op.drop_index("ix_detalle_inventario_estado", table_name="detalle_inventario")
    op.drop_index("ix_detalle_inventario_epc", table_name="detalle_inventario")
    op.drop_index("ix_detalle_inventario_inventario_id", table_name="detalle_inventario")
    op.drop_table("detalle_inventario")
    op.drop_index("ix_inventarios_estado", table_name="inventarios")
    op.drop_index("ix_inventarios_deposito_id", table_name="inventarios")
    op.drop_table("inventarios")
