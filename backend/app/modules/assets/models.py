import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Categoria(Base):
    __tablename__ = "categorias"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    activa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    activos: Mapped[list["Activo"]] = relationship(back_populates="categoria")


class Activo(Base):
    __tablename__ = "activos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    numero_patrimonial: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)
    categoria_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categorias.id"), nullable=False)
    epc: Mapped[str | None] = mapped_column(String(96), unique=True, nullable=True, index=True)
    datos_tecnicos: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Si True, cada etiqueta nueva exige número de serie de fábrica (serie_fisica).
    serializado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    creado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    ubicacion_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("ubicaciones.id", ondelete="SET NULL"), nullable=True, index=True
    )
    persona_custodio_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("personas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    categoria: Mapped["Categoria"] = relationship(back_populates="activos")
    ubicacion: Mapped["Ubicacion | None"] = relationship(back_populates="activos")
    fotografias: Mapped[list["Fotografia"]] = relationship(
        back_populates="activo", cascade="all, delete-orphan"
    )
    historial: Mapped[list["HistorialActivo"]] = relationship(
        back_populates="activo", cascade="all, delete-orphan"
    )
    etiquetas: Mapped[list["Etiqueta"]] = relationship(
        back_populates="activo", cascade="all, delete-orphan"
    )
    observaciones: Mapped[list["ActivoObservacion"]] = relationship(
        back_populates="activo", cascade="all, delete-orphan"
    )


class Etiqueta(Base):
    """Unidad física RFID de un artículo (SKU). Identificada por EPC único."""

    __tablename__ = "etiquetas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activo_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    epc: Mapped[str] = mapped_column(String(96), unique=True, nullable=False, index=True)
    serial_hex: Mapped[str | None] = mapped_column(String(12), nullable=True)
    # Número de serie de fábrica (opcional); independiente del serial del EPC.
    serie_fisica: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="activa", index=True)
    impresa: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ubicacion_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("ubicaciones.id", ondelete="SET NULL"), nullable=True, index=True
    )
    persona_custodio_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("personas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    impresa_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    activo: Mapped["Activo"] = relationship(back_populates="etiquetas")


class Fotografia(Base):
    __tablename__ = "fotografias"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activo_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nombre_archivo: Mapped[str] = mapped_column(String(255), nullable=False)
    ruta: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    tamano_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    es_principal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    activo: Mapped["Activo"] = relationship(back_populates="fotografias")


class HistorialActivo(Base):
    __tablename__ = "historial_activos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activo_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    accion: Mapped[str] = mapped_column(String(50), nullable=False)
    cambios: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    activo: Mapped["Activo"] = relationship(back_populates="historial")


class ActivoObservacion(Base):
    """Nota / observación libre asociada a un artículo."""

    __tablename__ = "activo_observaciones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activo_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    activo: Mapped["Activo"] = relationship(back_populates="observaciones")
