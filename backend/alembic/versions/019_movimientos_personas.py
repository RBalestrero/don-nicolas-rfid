"""Movimientos: tipo deposito|persona, personas y custodia.

Revision ID: 019
Revises: 018
Create Date: 2026-09-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "019"
down_revision: str | None = "018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "personas",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nombre", sa.String(length=150), nullable=False),
        sa.Column("documento", sa.String(length=40), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_personas_nombre", "personas", ["nombre"])
    op.create_index("ix_personas_documento", "personas", ["documento"])
    op.create_index("ix_personas_activo", "personas", ["activo"])

    op.add_column(
        "transferencias",
        sa.Column(
            "tipo",
            sa.String(length=20),
            nullable=False,
            server_default="deposito",
        ),
    )
    op.create_index("ix_transferencias_tipo", "transferencias", ["tipo"])

    op.alter_column(
        "transferencias",
        "deposito_destino_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )

    op.add_column(
        "transferencias",
        sa.Column("persona_destino_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_transferencias_persona_destino",
        "transferencias",
        "personas",
        ["persona_destino_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_transferencias_persona_destino_id",
        "transferencias",
        ["persona_destino_id"],
    )

    op.add_column(
        "activos",
        sa.Column("persona_custodio_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_activos_persona_custodio",
        "activos",
        "personas",
        ["persona_custodio_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_activos_persona_custodio_id", "activos", ["persona_custodio_id"])

    op.add_column(
        "etiquetas",
        sa.Column("persona_custodio_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_etiquetas_persona_custodio",
        "etiquetas",
        "personas",
        ["persona_custodio_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_etiquetas_persona_custodio_id",
        "etiquetas",
        ["persona_custodio_id"],
    )

    # Textos de permisos (códigos transfer.* se mantienen)
    op.execute(
        sa.text(
            "UPDATE permisos SET nombre = 'Escribir movimientos', "
            "descripcion = 'Crear y confirmar movimientos entre depósitos o a personas', "
            "modulo = 'movimientos' "
            "WHERE codigo = 'transfer.write'"
        )
    )
    op.execute(
        sa.text(
            "UPDATE permisos SET nombre = 'Cancelar movimientos', "
            "descripcion = 'Cancelar movimientos pendientes o en tránsito', "
            "modulo = 'movimientos' "
            "WHERE codigo = 'transfer.cancel'"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE permisos SET nombre = 'Escribir transferencias', "
            "descripcion = 'Crear y confirmar transferencias entre depósitos', "
            "modulo = 'transferencias' "
            "WHERE codigo = 'transfer.write'"
        )
    )
    op.execute(
        sa.text(
            "UPDATE permisos SET nombre = 'Cancelar transferencias', "
            "descripcion = 'Cancelar transferencias pendientes o en tránsito', "
            "modulo = 'transferencias' "
            "WHERE codigo = 'transfer.cancel'"
        )
    )

    op.drop_index("ix_etiquetas_persona_custodio_id", table_name="etiquetas")
    op.drop_constraint("fk_etiquetas_persona_custodio", "etiquetas", type_="foreignkey")
    op.drop_column("etiquetas", "persona_custodio_id")

    op.drop_index("ix_activos_persona_custodio_id", table_name="activos")
    op.drop_constraint("fk_activos_persona_custodio", "activos", type_="foreignkey")
    op.drop_column("activos", "persona_custodio_id")

    op.drop_index("ix_transferencias_persona_destino_id", table_name="transferencias")
    op.drop_constraint("fk_transferencias_persona_destino", "transferencias", type_="foreignkey")
    op.drop_column("transferencias", "persona_destino_id")

    op.alter_column(
        "transferencias",
        "deposito_destino_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )

    op.drop_index("ix_transferencias_tipo", table_name="transferencias")
    op.drop_column("transferencias", "tipo")

    op.drop_index("ix_personas_activo", table_name="personas")
    op.drop_index("ix_personas_documento", table_name="personas")
    op.drop_index("ix_personas_nombre", table_name="personas")
    op.drop_table("personas")
