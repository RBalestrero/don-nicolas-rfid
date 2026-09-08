"""Esquema de transferencias entre depósitos

Revision ID: 008
Revises: 007
Create Date: 2026-09-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transferencias",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "deposito_origen_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("depositos.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "deposito_destino_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("depositos.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "ubicacion_destino_id",
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
        sa.Column("estado", sa.String(20), nullable=False, server_default="pendiente"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("enviado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completado_en", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_transferencias_deposito_origen_id", "transferencias", ["deposito_origen_id"])
    op.create_index(
        "ix_transferencias_deposito_destino_id", "transferencias", ["deposito_destino_id"]
    )
    op.create_index("ix_transferencias_estado", "transferencias", ["estado"])

    op.create_table(
        "detalle_transferencia",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "transferencia_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("transferencias.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "activo_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("activos.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("epc", sa.String(96), nullable=True),
        sa.Column("numero_patrimonial", sa.String(50), nullable=True),
        sa.Column("descripcion", sa.String(255), nullable=True),
        sa.Column(
            "ubicacion_origen_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ubicaciones.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("confirmado_origen", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "confirmado_destino", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )
    op.create_index(
        "ix_detalle_transferencia_transferencia_id", "detalle_transferencia", ["transferencia_id"]
    )
    op.create_index("ix_detalle_transferencia_activo_id", "detalle_transferencia", ["activo_id"])
    op.create_index("ix_detalle_transferencia_epc", "detalle_transferencia", ["epc"])


def downgrade() -> None:
    op.drop_index("ix_detalle_transferencia_epc", table_name="detalle_transferencia")
    op.drop_index("ix_detalle_transferencia_activo_id", table_name="detalle_transferencia")
    op.drop_index("ix_detalle_transferencia_transferencia_id", table_name="detalle_transferencia")
    op.drop_table("detalle_transferencia")
    op.drop_index("ix_transferencias_estado", table_name="transferencias")
    op.drop_index("ix_transferencias_deposito_destino_id", table_name="transferencias")
    op.drop_index("ix_transferencias_deposito_origen_id", table_name="transferencias")
    op.drop_table("transferencias")
