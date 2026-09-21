"""Ubicación por etiqueta y vínculo en detalle de transferencia.

Revision ID: 014
Revises: 013
Create Date: 2026-09-14

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "014"
down_revision: str | None = "013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "etiquetas",
        sa.Column("ubicacion_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_etiquetas_ubicacion_id",
        "etiquetas",
        "ubicaciones",
        ["ubicacion_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_etiquetas_ubicacion_id", "etiquetas", ["ubicacion_id"])
    op.execute(
        sa.text(
            """
            UPDATE etiquetas e
            SET ubicacion_id = a.ubicacion_id
            FROM activos a
            WHERE e.activo_id = a.id
              AND e.ubicacion_id IS NULL
            """
        )
    )

    op.add_column(
        "detalle_transferencia",
        sa.Column("etiqueta_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_detalle_transferencia_etiqueta_id",
        "detalle_transferencia",
        "etiquetas",
        ["etiqueta_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_detalle_transferencia_etiqueta_id",
        "detalle_transferencia",
        ["etiqueta_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_detalle_transferencia_etiqueta_id", table_name="detalle_transferencia")
    op.drop_constraint(
        "fk_detalle_transferencia_etiqueta_id",
        "detalle_transferencia",
        type_="foreignkey",
    )
    op.drop_column("detalle_transferencia", "etiqueta_id")
    op.drop_index("ix_etiquetas_ubicacion_id", table_name="etiquetas")
    op.drop_constraint("fk_etiquetas_ubicacion_id", "etiquetas", type_="foreignkey")
    op.drop_column("etiquetas", "ubicacion_id")
