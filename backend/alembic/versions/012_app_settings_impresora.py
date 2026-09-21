"""Tabla app_settings para configuración runtime (impresora, etc.)

Revision ID: 012
Revises: 011
Create Date: 2026-09-11

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "012"
down_revision: str | None = "011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("clave", sa.String(length=100), primary_key=True, nullable=False),
        sa.Column("valor", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "actualizado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    # Semilla impresora ZD621R (overrideable desde Configuración)
    op.execute(
        sa.text(
            """
            INSERT INTO app_settings (clave, valor)
            VALUES (
              'zebra_printer',
              '{"host": "192.168.1.20", "port": 9100, "simulate": true, "timeout": 5}'::jsonb
            )
            ON CONFLICT (clave) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.drop_table("app_settings")
