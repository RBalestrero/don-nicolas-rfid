"""Generación y decodificación de EPC-96 privados (esquema Don Nicolás).

Formato D1 (24 hex = 96 bits)::

    D1 | ARTÍCULO (10 hex / 40 bits) | SERIAL (10 hex / 40 bits) | SUFIJO (2 hex)

- Prefijo ``D1``: versión del esquema (privado, no GS1).
- Artículo: dígitos del número patrimonial (p. ej. PAT-1001 → 1001).
- Serial: aleatorio de 40 bits → unicidad entre etiquetas del mismo artículo.
- Sufijo ``A1``: marca de sistema Don Nicolás. El MC33 filtra por este sufijo
  y descarta tags ajenos (otras empresas / otros esquemas).

Filtro rápido en campo: ``epc.endswith("A1")`` y ``epc.startswith("D1")``.
"""

from __future__ import annotations

import re
import secrets
from dataclasses import dataclass

SCHEME_PREFIX = "D1"
SCHEME_VERSION = "D1"
SYSTEM_SUFFIX = "A1"
_ART_HEX_LEN = 10
_SER_HEX_LEN = 10
_SUF_HEX_LEN = 2
_EPC_HEX_LEN = 24
_MAX_ART = (1 << 40) - 1
_MAX_SER = (1 << 40) - 1


@dataclass(frozen=True)
class EpcDecoded:
    """Resultado de decodificar un EPC."""

    epc: str
    scheme: str | None
    articulo_code: int | None
    articulo_sugerido: str | None
    serial: int | None
    serial_hex: str | None
    system_suffix: str | None
    del_sistema: bool
    valido: bool
    mensaje: str


def articulo_code_from_patrimonial(numero_patrimonial: str) -> int:
    """Extrae un código de artículo reversible desde el número patrimonial.

    Preferimos los dígitos (``PAT-1001`` → ``1001``). Si no hay dígitos,
    codificamos alfanuméricos en base-36 (hasta 8 caracteres).
    """
    raw = (numero_patrimonial or "").strip().upper()
    if not raw:
        raise ValueError("numero_patrimonial vacío")

    digits = re.sub(r"\D", "", raw)
    if digits:
        code = int(digits)
        if code > _MAX_ART:
            raise ValueError(
                f"Código de artículo demasiado grande para EPC-96 ({code} > 2^40-1)"
            )
        return code

    cleaned = re.sub(r"[^A-Z0-9]", "", raw)[:8]
    if not cleaned:
        raise ValueError(f"No se pudo derivar código de artículo de '{numero_patrimonial}'")
    code = int(cleaned, 36)
    if code > _MAX_ART:
        raise ValueError(
            f"Código de artículo demasiado grande para EPC-96 ({code} > 2^40-1)"
        )
    return code


def sugerir_patrimonial(articulo_code: int) -> str:
    """Sugerencia legible del artículo a partir del código embebido."""
    return f"PAT-{articulo_code}"


def normalizar_epc(epc: str | None) -> str:
    return (epc or "").strip().upper().replace(" ", "")


def pertenece_al_sistema(epc: str | None) -> bool:
    """True si el EPC es Don Nicolás (prefijo D1 + 96 bits).

    Acepta el formato nuevo ``D1…A1`` y el legado ``D1`` sin sufijo.
    Rechaza esquemas ajenos (p. ej. E280…).
    """
    raw = normalizar_epc(epc)
    return (
        len(raw) == _EPC_HEX_LEN
        and raw.startswith(SCHEME_PREFIX)
        and bool(re.fullmatch(r"[0-9A-F]+", raw))
    )


def generar_epc(activo_id: str, numero_patrimonial: str | None = None) -> str:
    """Genera un EPC-96 único (D1 + artículo + serial + sufijo sistema)."""
    _ = activo_id
    if not numero_patrimonial:
        raise ValueError("numero_patrimonial es obligatorio para generar EPC D1")

    art = articulo_code_from_patrimonial(numero_patrimonial)
    serial = secrets.randbits(40)
    return encode_epc(art, serial)


def encode_epc(articulo_code: int, serial: int) -> str:
    if articulo_code < 0 or articulo_code > _MAX_ART:
        raise ValueError("articulo_code fuera de rango")
    if serial < 0 or serial > _MAX_SER:
        raise ValueError("serial fuera de rango")
    return (
        f"{SCHEME_PREFIX}"
        f"{articulo_code:0{_ART_HEX_LEN}X}"
        f"{serial:0{_SER_HEX_LEN}X}"
        f"{SYSTEM_SUFFIX}"
    )


def decode_epc(epc: str) -> EpcDecoded:
    """Decodifica un EPC. Solo D1…A1 es del sistema; el resto se marca ajeno/legado."""
    raw = normalizar_epc(epc)
    if not raw:
        return EpcDecoded(
            epc="",
            scheme=None,
            articulo_code=None,
            articulo_sugerido=None,
            serial=None,
            serial_hex=None,
            system_suffix=None,
            del_sistema=False,
            valido=False,
            mensaje="EPC vacío",
        )

    if not re.fullmatch(r"[0-9A-F]+", raw):
        return EpcDecoded(
            epc=raw,
            scheme=None,
            articulo_code=None,
            articulo_sugerido=None,
            serial=None,
            serial_hex=None,
            system_suffix=None,
            del_sistema=False,
            valido=False,
            mensaje="EPC inválido: solo se permiten hexadecimales",
        )

    if len(raw) != _EPC_HEX_LEN:
        return EpcDecoded(
            epc=raw,
            scheme=None,
            articulo_code=None,
            articulo_sugerido=None,
            serial=None,
            serial_hex=None,
            system_suffix=None,
            del_sistema=False,
            valido=False,
            mensaje=f"EPC debe tener {_EPC_HEX_LEN} hex (96 bits); tiene {len(raw)}",
        )

    if pertenece_al_sistema(raw):
        art_hex = raw[2 : 2 + _ART_HEX_LEN]
        ser_hex = raw[2 + _ART_HEX_LEN : 2 + _ART_HEX_LEN + _SER_HEX_LEN]
        suf = raw[-_SUF_HEX_LEN:]
        articulo_code = int(art_hex, 16)
        serial = int(ser_hex, 16)
        return EpcDecoded(
            epc=raw,
            scheme=SCHEME_VERSION,
            articulo_code=articulo_code,
            articulo_sugerido=sugerir_patrimonial(articulo_code),
            serial=serial,
            serial_hex=ser_hex,
            system_suffix=suf,
            del_sistema=True,
            valido=True,
            mensaje="OK",
        )

    # D1 sin sufijo A1 (generación previa) — legado interno, sigue siendo del sistema
    if raw.startswith(SCHEME_PREFIX) and not raw.endswith(SYSTEM_SUFFIX):
        art_hex = raw[2 : 2 + _ART_HEX_LEN]
        ser_hex = raw[2 + _ART_HEX_LEN :]
        return EpcDecoded(
            epc=raw,
            scheme="legacy_d1",
            articulo_code=int(art_hex, 16) if len(art_hex) == _ART_HEX_LEN else None,
            articulo_sugerido=(
                sugerir_patrimonial(int(art_hex, 16))
                if len(art_hex) == _ART_HEX_LEN
                else None
            ),
            serial=int(ser_hex, 16) if ser_hex else None,
            serial_hex=ser_hex or None,
            system_suffix=None,
            del_sistema=True,
            valido=True,
            mensaje="EPC D1 sin sufijo A1 (legado, aceptado)",
        )

    return EpcDecoded(
        epc=raw,
        scheme="ajeno",
        articulo_code=None,
        articulo_sugerido=None,
        serial=None,
        serial_hex=None,
        system_suffix=None,
        del_sistema=False,
        valido=True,
        mensaje="EPC ajeno al sistema Don Nicolás (sin marca D1…A1)",
    )
