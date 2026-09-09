import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Inventario(Base):
    __tablename__ = "inventarios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deposito_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("depositos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    sector_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sectores.id", ondelete="SET NULL"), nullable=True
    )
    ubicacion_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("ubicaciones.id", ondelete="SET NULL"), nullable=True
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="en_curso", index=True)
    total_esperado: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_encontrado: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_faltante: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_sobrante: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    iniciado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    cerrado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    auditado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    auditado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    auditado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    comentario_auditoria: Mapped[str | None] = mapped_column(Text, nullable=True)

    detalles: Mapped[list["DetalleInventario"]] = relationship(
        back_populates="inventario",
        cascade="all, delete-orphan",
    )


class DetalleInventario(Base):
    __tablename__ = "detalle_inventario"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inventario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("inventarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activo_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("activos.id", ondelete="SET NULL"), nullable=True
    )
    epc: Mapped[str | None] = mapped_column(String(96), nullable=True, index=True)
    numero_patrimonial: Mapped[str | None] = mapped_column(String(50), nullable=True)
    descripcion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="esperado", index=True)
    leido_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    inventario: Mapped["Inventario"] = relationship(back_populates="detalles")
