"""Código interno compacto para campo ART del EPC-96 (codigo_epc).

Revision ID: 021
Revises: 020
Create Date: 2026-09-30

"""

from __future__ import annotations

import re
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "021"
down_revision: str | None = "020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_MAX_ART = (1 << 40) - 1


def _legacy_code_from_patrimonial(numero: str) -> int | None:
    """Misma lógica que articulo_code_from_patrimonial (sin importar app)."""
    raw = (numero or "").strip().upper()
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if digits:
        try:
            code = int(digits)
        except ValueError:
            return None
        if 0 <= code <= _MAX_ART:
            return code
        return None
    cleaned = re.sub(r"[^A-Z0-9]", "", raw)[:8]
    if not cleaned:
        return None
    try:
        code = int(cleaned, 36)
    except ValueError:
        return None
    if 0 <= code <= _MAX_ART:
        return code
    return None


def upgrade() -> None:
    op.add_column(
        "activos",
        sa.Column("codigo_epc", sa.BigInteger(), nullable=True),
    )

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, numero_patrimonial FROM activos ORDER BY creado_en ASC NULLS LAST, id ASC"
        )
    ).fetchall()

    used: set[int] = set()
    next_seq = 1
    for row in rows:
        activo_id, patrimonial = row[0], row[1]
        preferred = _legacy_code_from_patrimonial(patrimonial)
        if preferred is not None and preferred not in used:
            code = preferred
        else:
            while next_seq in used or next_seq == 0:
                next_seq += 1
                if next_seq > _MAX_ART:
                    raise RuntimeError("Agotado el espacio de codigo_epc (2^40)")
            code = next_seq
            next_seq += 1
        used.add(code)
        conn.execute(
            sa.text("UPDATE activos SET codigo_epc = :code WHERE id = :id"),
            {"code": code, "id": activo_id},
        )

    op.alter_column("activos", "codigo_epc", nullable=False)
    op.create_index("ix_activos_codigo_epc", "activos", ["codigo_epc"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_activos_codigo_epc", table_name="activos")
    op.drop_column("activos", "codigo_epc")
