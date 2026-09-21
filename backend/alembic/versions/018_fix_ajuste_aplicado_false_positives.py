"""Corrige false positives de ajuste_aplicado en inventarios cerrados.

Revision ID: 018
Revises: 017
Create Date: 2026-09-18

La 017 marcó ajuste_aplicado=true en todos los cerrado. Eso oculta el
descarte y saltea el ajuste real cuando el stock nunca se aplicó
(conteos sin faltantes, o cerrados ya con stock diferido). Solo debe
quedar true si hay historial de ajuste_inventario para ese inventario.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "018"
down_revision: str | None = "017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE inventarios i
            SET ajuste_aplicado = false
            WHERE i.estado = 'cerrado'
              AND i.ajuste_aplicado = true
              AND i.auditado = false
              AND NOT EXISTS (
                SELECT 1
                FROM historial_activos h
                WHERE h.accion = 'ajuste_inventario'
                  AND h.cambios->>'inventario_id' = i.id::text
              )
            """
        )
    )


def downgrade() -> None:
    # No revertimos: el backfill amplio de 017 era incorrecto.
    pass
