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


async def save_upload(file: UploadFile, activo_id: uuid.UUID) -> tuple[str, str, int]:
    settings = get_settings()
    validate_image(file)

    content = await file.read()
    size = len(content)

    if size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo está vacío."
        )

    if size > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El archivo supera el límite de {settings.max_upload_size_mb} MB.",
        )

    extension = Path(file.filename or "foto.jpg").suffix.lower()
    filename = f"{uuid.uuid4()}{extension}"
    directory = Path(settings.upload_dir) / "activos" / str(activo_id)
    directory.mkdir(parents=True, exist_ok=True)

    file_path = directory / filename
    file_path.write_bytes(content)

    relative_path = str(file_path.as_posix())
    return relative_path, filename, size
