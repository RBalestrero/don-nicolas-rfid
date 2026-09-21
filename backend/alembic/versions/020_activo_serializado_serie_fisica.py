"""Serie física opcional: activo.serializado + etiqueta.serie_fisica.

Revision ID: 020
Revises: 019
Create Date: 2026-09-21

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "020"
down_revision: str | None = "019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "activos",
        sa.Column(
            "serializado",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "etiquetas",
        sa.Column("serie_fisica", sa.String(length=120), nullable=True),
    )
    op.create_index("ix_etiquetas_serie_fisica", "etiquetas", ["serie_fisica"])
    op.create_index(
        "uq_etiquetas_activo_serie_fisica",
        "etiquetas",
        ["activo_id", "serie_fisica"],
        unique=True,
        postgresql_where=sa.text("serie_fisica IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_etiquetas_activo_serie_fisica", table_name="etiquetas")
    op.drop_index("ix_etiquetas_serie_fisica", table_name="etiquetas")
    op.drop_column("etiquetas", "serie_fisica")
    op.drop_column("activos", "serializado")
