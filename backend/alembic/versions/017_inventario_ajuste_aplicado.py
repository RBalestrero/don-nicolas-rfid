"""Flag ajuste_aplicado en inventarios (stock diferido a auditoría).

Revision ID: 017
Revises: 016
Create Date: 2026-09-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "017"
down_revision: str | None = "016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "inventarios",
        sa.Column(
            "ajuste_aplicado",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # Inventarios ya cerrados aplicaron stock al cerrar (comportamiento previo).
    op.execute(
        sa.text("UPDATE inventarios SET ajuste_aplicado = true WHERE estado = 'cerrado'")
    )


def downgrade() -> None:
    op.drop_column("inventarios", "ajuste_aplicado")
