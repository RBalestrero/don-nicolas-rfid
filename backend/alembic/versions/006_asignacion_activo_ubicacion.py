"""Asignación de activos a ubicaciones

Revision ID: 006
Revises: 005
Create Date: 2026-08-31

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "activos",
        sa.Column("ubicacion_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_activos_ubicacion_id",
        "activos",
        "ubicaciones",
        ["ubicacion_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_activos_ubicacion_id", "activos", ["ubicacion_id"])


def downgrade() -> None:
    op.drop_index("ix_activos_ubicacion_id", table_name="activos")
    op.drop_constraint("fk_activos_ubicacion_id", "activos", type_="foreignkey")
    op.drop_column("activos", "ubicacion_id")
