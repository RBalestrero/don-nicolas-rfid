from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class PermisoResponse(BaseModel):
    id: str
    codigo: str
    nombre: str
    descripcion: str | None = None
    modulo: str

    model_config = {"from_attributes": True}


class RolResponse(BaseModel):
    id: str
    nombre: str
    descripcion: str | None = None
    es_sistema: bool = False
    permisos: list[str] = Field(default_factory=list)
    usuarios_count: int = 0

    model_config = {"from_attributes": True}


class RolCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=50)
    descripcion: str | None = Field(default=None, max_length=500)
    permisos: list[str] = Field(default_factory=list)


class RolUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=50)
    descripcion: str | None = Field(default=None, max_length=500)
    permisos: list[str] | None = None


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
