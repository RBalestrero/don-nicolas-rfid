"""Esquema activos y categorías

Revision ID: 002
Revises: 001
Create Date: 2026-08-31

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "categorias",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nombre", sa.String(length=100), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nombre"),
    )

    op.create_table(
        "activos",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("numero_patrimonial", sa.String(length=50), nullable=False),
        sa.Column("descripcion", sa.String(length=255), nullable=False),
        sa.Column("categoria_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("epc", sa.String(length=96), nullable=True),
        sa.Column("datos_tecnicos", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("creado_por_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["categoria_id"], ["categorias.id"]),
        sa.ForeignKeyConstraint(["creado_por_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("epc"),
        sa.UniqueConstraint("numero_patrimonial"),
    )
    op.create_index("ix_activos_numero_patrimonial", "activos", ["numero_patrimonial"])
    op.create_index("ix_activos_epc", "activos", ["epc"])


def downgrade() -> None:
    op.drop_index("ix_activos_epc", table_name="activos")
    op.drop_index("ix_activos_numero_patrimonial", table_name="activos")
    op.drop_table("activos")
    op.drop_table("categorias")
