from pydantic import BaseModel, Field


class ImpresoraConfig(BaseModel):
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(..., ge=1, le=65535)
    simulate: bool = True
    timeout: int = Field(5, ge=1, le=60)


class ImpresoraConfigUpdate(BaseModel):
    host: str | None = Field(None, min_length=1, max_length=255)
    port: int | None = Field(None, ge=1, le=65535)
    simulate: bool | None = None
    timeout: int | None = Field(None, ge=1, le=60)


class ImpresoraConfigResponse(ImpresoraConfig):
    actualizado_en: str | None = None
    fuente: str = "runtime"


class ImpresoraEstadoResponse(BaseModel):
    status: str
    mensaje: str
    host: str
    port: int
    simulate: bool
    detalle: str | None = None
