import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Transferencia(Base):
    __tablename__ = "transferencias"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deposito_origen_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("depositos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    deposito_destino_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("depositos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    ubicacion_destino_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("ubicaciones.id", ondelete="SET NULL"), nullable=True
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="pendiente", index=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    enviado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    detalles: Mapped[list["DetalleTransferencia"]] = relationship(
        back_populates="transferencia",
        cascade="all, delete-orphan",
    )


class DetalleTransferencia(Base):
    __tablename__ = "detalle_transferencia"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transferencia_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transferencias.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activo_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    epc: Mapped[str | None] = mapped_column(String(96), nullable=True, index=True)
    numero_patrimonial: Mapped[str | None] = mapped_column(String(50), nullable=True)
    descripcion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ubicacion_origen_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("ubicaciones.id", ondelete="SET NULL"), nullable=True
    )
    confirmado_origen: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    confirmado_destino: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    transferencia: Mapped["Transferencia"] = relationship(back_populates="detalles")
