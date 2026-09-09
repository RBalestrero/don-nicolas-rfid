from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RolResponse(BaseModel):
    id: str
    nombre: str
    descripcion: str | None = None

    model_config = {"from_attributes": True}


class UsuarioAdminResponse(BaseModel):
    id: str
    email: str
    nombre: str
    rol: str
    rol_id: str
    activo: bool
    creado_en: datetime
    actualizado_en: datetime

    model_config = {"from_attributes": True}


class UsuarioCreate(BaseModel):
    email: EmailStr = Field(..., max_length=254)
    nombre: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=6, max_length=128)
    rol: str = Field(..., min_length=1, max_length=50)
    activo: bool = True


class UsuarioUpdate(BaseModel):
    email: EmailStr | None = Field(default=None, max_length=254)
    nombre: str | None = Field(default=None, min_length=1, max_length=100)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    rol: str | None = Field(default=None, min_length=1, max_length=50)
    activo: bool | None = None
