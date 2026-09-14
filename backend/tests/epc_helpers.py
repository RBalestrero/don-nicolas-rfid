"""EPCs de prueba con el esquema real del sistema.

Los tests generan EPCs con el mismo codificador que usa la impresión, para que
no puedan divergir del esquema D1 que el MC33 filtra al leer.
"""

from __future__ import annotations

import secrets

from app.integrations.zebra.epc_generator import encode_epc

_MAX_ART = (1 << 40) - 1


def epc_de_prueba(articulo_code: int | None = None) -> str:
    """EPC-96 válido del sistema (D1 … A1), único por serial aleatorio."""
    art = articulo_code if articulo_code is not None else secrets.randbelow(_MAX_ART)
    return encode_epc(art, secrets.randbits(40))
