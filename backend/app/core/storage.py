import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.config import get_settings

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def validate_image(file: UploadFile) -> None:
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato no permitido. Usá JPEG, PNG o WebP.",
        )

    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Extensión de archivo no permitida.",
        )


def _extension_from_magic(content: bytes) -> str | None:
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"
    return None


async def save_upload(file: UploadFile, activo_id: uuid.UUID) -> tuple[str, str, int]:
    settings = get_settings()
    validate_image(file)

    max_bytes = settings.max_upload_size_bytes
    # Leer en chunks para no cargar payloads enormes sin Content-Length.
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El archivo supera el límite de {settings.max_upload_size_mb} MB.",
            )
        chunks.append(chunk)
    content = b"".join(chunks)
    size = len(content)

    if size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo está vacío."
        )

    magic_ext = _extension_from_magic(content)
    if magic_ext is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El contenido no es una imagen JPEG, PNG o WebP válida.",
        )

    claimed_ext = Path(file.filename or "foto.jpg").suffix.lower()
    if claimed_ext == ".jpeg":
        claimed_ext = ".jpg"
    if claimed_ext != magic_ext:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La extensión no coincide con el contenido del archivo.",
        )

    filename = f"{uuid.uuid4()}{magic_ext}"
    directory = Path(settings.upload_dir) / "activos" / str(activo_id)
    directory.mkdir(parents=True, exist_ok=True)

    file_path = directory / filename
    file_path.write_bytes(content)

    relative_path = str(file_path.as_posix())
    return relative_path, filename, size
