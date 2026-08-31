"""Esquema fotografías de activos

Revision ID: 003
Revises: 002
Create Date: 2026-08-31

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "fotografias",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("activo_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nombre_archivo", sa.String(length=255), nullable=False),
        sa.Column("ruta", sa.String(length=500), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("tamano_bytes", sa.Integer(), nullable=False),
        sa.Column("es_principal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["activo_id"], ["activos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fotografias_activo_id", "fotografias", ["activo_id"])


def downgrade() -> None:
    op.drop_index("ix_fotografias_activo_id", table_name="fotografias")
    op.drop_table("fotografias")
