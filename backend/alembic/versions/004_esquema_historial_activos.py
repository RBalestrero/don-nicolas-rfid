"""Historial de auditoría de activos

Revision ID: 004
Revises: 003
Create Date: 2026-08-31

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "historial_activos",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("activo_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("accion", sa.String(length=50), nullable=False),
        sa.Column("cambios", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["activo_id"], ["activos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_historial_activos_activo_id", "historial_activos", ["activo_id"])


def downgrade() -> None:
    op.drop_index("ix_historial_activos_activo_id", table_name="historial_activos")
    op.drop_table("historial_activos")
