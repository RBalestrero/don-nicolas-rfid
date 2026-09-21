from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DispositivoRegistroRequest(BaseModel):
    device_key: str = Field(min_length=1, max_length=64)
    modelo: str = Field(min_length=1, max_length=120)
    fabricante: str | None = Field(default=None, max_length=120)
    numero_serie: str | None = Field(default=None, max_length=120)
    app_version: str | None = Field(default=None, max_length=40)
    android_version: str | None = Field(default=None, max_length=20)


class DispositivoHeartbeatRequest(BaseModel):
    device_key: str = Field(min_length=1, max_length=64)


class DispositivoLogoutRequest(BaseModel):
    device_key: str = Field(min_length=1, max_length=64)


class DispositivoMovilItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    device_key: str
    modelo: str
    fabricante: str | None = None
    numero_serie: str | None = None
    app_version: str | None = None
    android_version: str | None = None
    usuario_id: UUID | None = None
    usuario_nombre: str | None = None
    usuario_email: str | None = None
    ultimo_visto_en: datetime
    registrado_en: datetime
    sesion_activa: bool
    en_linea: bool
    # en_linea | inactivo (sesión viva sin heartbeat) | sesion_cerrada
    estado: str
