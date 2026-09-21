"""Dispositivos móviles MC33 registrados.

Revision ID: 016
Revises: 015
Create Date: 2026-09-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "016"
down_revision: str | None = "015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "dispositivos_moviles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_key", sa.String(length=64), nullable=False),
        sa.Column("modelo", sa.String(length=120), nullable=False),
        sa.Column("fabricante", sa.String(length=120), nullable=True),
        sa.Column("numero_serie", sa.String(length=120), nullable=True),
        sa.Column("app_version", sa.String(length=40), nullable=True),
        sa.Column("android_version", sa.String(length=20), nullable=True),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ultimo_visto_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "registrado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("sesion_activa", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "actualizado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("device_key"),
    )
    op.create_index("ix_dispositivos_moviles_device_key", "dispositivos_moviles", ["device_key"])
    op.create_index(
        "ix_dispositivos_moviles_ultimo_visto_en",
        "dispositivos_moviles",
        ["ultimo_visto_en"],
    )
    op.create_index("ix_dispositivos_moviles_usuario_id", "dispositivos_moviles", ["usuario_id"])


def downgrade() -> None:
    op.drop_index("ix_dispositivos_moviles_usuario_id", table_name="dispositivos_moviles")
    op.drop_index("ix_dispositivos_moviles_ultimo_visto_en", table_name="dispositivos_moviles")
    op.drop_index("ix_dispositivos_moviles_device_key", table_name="dispositivos_moviles")
    op.drop_table("dispositivos_moviles")
