import uuid


def generar_epc(activo_id: uuid.UUID) -> str:
    """Genera un EPC-96 único (24 caracteres hex) basado en el ID del activo."""
    base = activo_id.hex.replace("-", "").upper()
    return f"E280{base[:20]}"
