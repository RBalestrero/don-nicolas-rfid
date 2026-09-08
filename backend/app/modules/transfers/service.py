import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.modules.assets.historial_service import HistorialService
from app.modules.assets.models import Activo
from app.modules.auth.models import Usuario
from app.modules.transfers.models import DetalleTransferencia, Transferencia
from app.modules.transfers.schemas import (
    DetalleTransferenciaResponse,
    TransferenciaConfirmarDestinoRequest,
    TransferenciaCreate,
    TransferenciaEpcsRequest,
    TransferenciaListItem,
    TransferenciaResponse,
)
from app.modules.warehouses.models import Deposito, Sector, Ubicacion


ESTADO_PENDIENTE = "pendiente"
ESTADO_EN_TRANSITO = "en_transito"
ESTADO_COMPLETADA = "completada"
ESTADO_CANCELADA = "cancelada"

ESTADOS_ABIERTOS = {ESTADO_PENDIENTE, ESTADO_EN_TRANSITO}


class TransferService:
    def __init__(self, db: Session):
        self.db = db
        self.historial = HistorialService(db)

    def create(self, data: TransferenciaCreate, user: Usuario) -> TransferenciaResponse:
        if data.deposito_origen_id == data.deposito_destino_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El depósito origen y destino deben ser distintos",
            )

        origen = self._get_deposito_activo(data.deposito_origen_id)
        destino = self._get_deposito_activo(data.deposito_destino_id)

        ubicacion_destino_id = data.ubicacion_destino_id
        if ubicacion_destino_id is not None:
            self._get_ubicacion_en_deposito(ubicacion_destino_id, destino.id)

        activo_ids = list(dict.fromkeys(data.activo_ids))
        activos = self._load_activos(activo_ids)
        if len(activos) != len(activo_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uno o más activos no existen o están inactivos",
            )

        for activo in activos:
            self._assert_activo_en_deposito(activo, origen.id)
            self._assert_activo_libre(activo.id)

        transferencia = Transferencia(
            deposito_origen_id=origen.id,
            deposito_destino_id=destino.id,
            ubicacion_destino_id=ubicacion_destino_id,
            usuario_id=user.id,
            estado=ESTADO_PENDIENTE,
            notas=data.notas,
        )
        self.db.add(transferencia)
        self.db.flush()

        for activo in activos:
            self.db.add(
                DetalleTransferencia(
                    transferencia_id=transferencia.id,
                    activo_id=activo.id,
                    epc=activo.epc,
                    numero_patrimonial=activo.numero_patrimonial,
                    descripcion=activo.descripcion,
                    ubicacion_origen_id=activo.ubicacion_id,
                )
            )

        self.db.commit()
        return self.get(transferencia.id)

    def get(self, transferencia_id: uuid.UUID) -> TransferenciaResponse:
        transferencia = self._get_or_404(transferencia_id)
        return self._to_response(transferencia)

    def list_transferencias(
        self,
        *,
        estado: str | None = None,
        deposito_origen_id: uuid.UUID | None = None,
        deposito_destino_id: uuid.UUID | None = None,
        limit: int = 50,
    ) -> list[TransferenciaListItem]:
        stmt = (
            select(Transferencia)
            .options(selectinload(Transferencia.detalles))
            .order_by(Transferencia.creado_en.desc())
            .limit(min(max(limit, 1), 10_000))
        )
        if estado is not None:
            stmt = stmt.where(Transferencia.estado == estado)
        if deposito_origen_id is not None:
            stmt = stmt.where(Transferencia.deposito_origen_id == deposito_origen_id)
        if deposito_destino_id is not None:
            stmt = stmt.where(Transferencia.deposito_destino_id == deposito_destino_id)

        rows = list(self.db.scalars(stmt).all())
        return [self._to_list_item(row) for row in rows]

    def confirmar_origen(
        self, transferencia_id: uuid.UUID, data: TransferenciaEpcsRequest
    ) -> TransferenciaResponse:
        transferencia = self._get_or_404(transferencia_id)
        if transferencia.estado != ESTADO_PENDIENTE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Solo se puede confirmar origen en transferencias pendientes",
            )

        epcs = self._normalize_epcs(data.epcs)
        self._match_epcs(transferencia.detalles, epcs, etapa="origen")

        for detalle in transferencia.detalles:
            detalle.confirmado_origen = True

        transferencia.estado = ESTADO_EN_TRANSITO
        transferencia.enviado_en = datetime.now(UTC)
        self.db.commit()
        return self.get(transferencia.id)

    def confirmar_destino(
        self,
        transferencia_id: uuid.UUID,
        data: TransferenciaConfirmarDestinoRequest,
        user: Usuario,
    ) -> TransferenciaResponse:
        transferencia = self._get_or_404(transferencia_id)
        if transferencia.estado != ESTADO_EN_TRANSITO:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Solo se puede confirmar destino en transferencias en tránsito",
            )

        ubicacion_destino_id = data.ubicacion_destino_id or transferencia.ubicacion_destino_id
        if ubicacion_destino_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debés indicar la ubicación de destino",
            )

        ubicacion = self._get_ubicacion_en_deposito(
            ubicacion_destino_id, transferencia.deposito_destino_id
        )

        epcs = self._normalize_epcs(data.epcs)
        self._match_epcs(transferencia.detalles, epcs, etapa="destino")

        activo_ids = [d.activo_id for d in transferencia.detalles]
        activos = {
            a.id: a
            for a in self.db.scalars(select(Activo).where(Activo.id.in_(activo_ids))).all()
        }

        for detalle in transferencia.detalles:
            detalle.confirmado_destino = True
            activo = activos.get(detalle.activo_id)
            if not activo:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Activo {detalle.activo_id} no encontrado",
                )
            ubicacion_anterior = str(activo.ubicacion_id) if activo.ubicacion_id else None
            activo.ubicacion_id = ubicacion.id
            self.historial.registrar(
                activo_id=activo.id,
                accion=HistorialService.ACCION_TRANSFERENCIA,
                usuario=user,
                cambios={
                    "transferencia_id": str(transferencia.id),
                    "deposito_origen_id": str(transferencia.deposito_origen_id),
                    "deposito_destino_id": str(transferencia.deposito_destino_id),
                    "ubicacion_id": {
                        "anterior": ubicacion_anterior,
                        "nuevo": str(ubicacion.id),
                    },
                    "ubicacion_codigo": ubicacion.codigo,
                },
            )

        transferencia.ubicacion_destino_id = ubicacion.id
        transferencia.estado = ESTADO_COMPLETADA
        transferencia.completado_en = datetime.now(UTC)
        self.db.commit()
        return self.get(transferencia.id)

    def cancelar(self, transferencia_id: uuid.UUID) -> TransferenciaResponse:
        transferencia = self._get_or_404(transferencia_id)
        if transferencia.estado not in ESTADOS_ABIERTOS:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Solo se pueden cancelar transferencias pendientes o en tránsito",
            )
        transferencia.estado = ESTADO_CANCELADA
        self.db.commit()
        return self.get(transferencia.id)

    def _get_or_404(self, transferencia_id: uuid.UUID) -> Transferencia:
        stmt = (
            select(Transferencia)
            .options(selectinload(Transferencia.detalles))
            .where(Transferencia.id == transferencia_id)
        )
        transferencia = self.db.scalars(stmt).first()
        if not transferencia:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Transferencia no encontrada"
            )
        return transferencia

    def _get_deposito_activo(self, deposito_id: uuid.UUID) -> Deposito:
        deposito = self.db.get(Deposito, deposito_id)
        if not deposito or not deposito.activo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Depósito inválido o inactivo"
            )
        return deposito

    def _get_ubicacion_en_deposito(
        self, ubicacion_id: uuid.UUID, deposito_id: uuid.UUID
    ) -> Ubicacion:
        stmt = (
            select(Ubicacion)
            .options(joinedload(Ubicacion.sector).joinedload(Sector.deposito))
            .where(Ubicacion.id == ubicacion_id)
        )
        ubicacion = self.db.scalars(stmt).first()
        if (
            not ubicacion
            or not ubicacion.activo
            or not ubicacion.sector.activo
            or not ubicacion.sector.deposito.activo
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Ubicación inválida o inactiva"
            )
        if ubicacion.sector.deposito_id != deposito_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La ubicación no pertenece al depósito destino",
            )
        return ubicacion

    def _load_activos(self, activo_ids: list[uuid.UUID]) -> list[Activo]:
        stmt = (
            select(Activo)
            .options(joinedload(Activo.ubicacion).joinedload(Ubicacion.sector))
            .where(Activo.id.in_(activo_ids), Activo.activo.is_(True))
        )
        by_id = {a.id: a for a in self.db.scalars(stmt).unique().all()}
        return [by_id[aid] for aid in activo_ids if aid in by_id]

    def _assert_activo_en_deposito(self, activo: Activo, deposito_id: uuid.UUID) -> None:
        if not activo.ubicacion_id or not activo.ubicacion:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El activo {activo.numero_patrimonial} no tiene ubicación asignada",
            )
        if activo.ubicacion.sector.deposito_id != deposito_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"El activo {activo.numero_patrimonial} no está en el depósito origen"
                ),
            )

    def _assert_activo_libre(self, activo_id: uuid.UUID) -> None:
        stmt = (
            select(DetalleTransferencia.id)
            .join(Transferencia)
            .where(
                DetalleTransferencia.activo_id == activo_id,
                Transferencia.estado.in_(list(ESTADOS_ABIERTOS)),
            )
            .limit(1)
        )
        if self.db.scalars(stmt).first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Uno o más activos ya están en una transferencia abierta",
            )

    @staticmethod
    def _normalize_epcs(epcs: list[str]) -> set[str]:
        return {e.strip().upper() for e in epcs if e and e.strip()}

    def _match_epcs(
        self,
        detalles: list[DetalleTransferencia],
        epcs: set[str],
        *,
        etapa: str,
    ) -> None:
        esperados = {d.epc.upper() for d in detalles if d.epc}
        sin_epc = [d.numero_patrimonial or str(d.activo_id) for d in detalles if not d.epc]
        if sin_epc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Todos los activos de la transferencia deben tener EPC para confirmar "
                    f"{etapa}. Sin EPC: {', '.join(sin_epc)}"
                ),
            )
        if not epcs:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Debés enviar los EPCs leídos para confirmar {etapa}",
            )
        faltantes = esperados - epcs
        sobrantes = epcs - esperados
        if faltantes or sobrantes:
            parts = []
            if faltantes:
                parts.append(f"faltan {sorted(faltantes)}")
            if sobrantes:
                parts.append(f"no pertenecen a la orden: {sorted(sobrantes)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"EPCs incompletos o incorrectos al confirmar {etapa}: {'; '.join(parts)}",
            )

    def _to_list_item(self, transferencia: Transferencia) -> TransferenciaListItem:
        confirmados_origen = sum(1 for d in transferencia.detalles if d.confirmado_origen)
        confirmados_destino = sum(1 for d in transferencia.detalles if d.confirmado_destino)
        return TransferenciaListItem(
            id=transferencia.id,
            deposito_origen_id=transferencia.deposito_origen_id,
            deposito_destino_id=transferencia.deposito_destino_id,
            ubicacion_destino_id=transferencia.ubicacion_destino_id,
            estado=transferencia.estado,
            total_activos=len(transferencia.detalles),
            confirmados_origen=confirmados_origen,
            confirmados_destino=confirmados_destino,
            creado_en=transferencia.creado_en,
            enviado_en=transferencia.enviado_en,
            completado_en=transferencia.completado_en,
        )

    def _to_response(self, transferencia: Transferencia) -> TransferenciaResponse:
        item = self._to_list_item(transferencia)
        return TransferenciaResponse(
            id=item.id,
            deposito_origen_id=item.deposito_origen_id,
            deposito_destino_id=item.deposito_destino_id,
            ubicacion_destino_id=item.ubicacion_destino_id,
            usuario_id=transferencia.usuario_id,
            estado=item.estado,
            notas=transferencia.notas,
            total_activos=item.total_activos,
            confirmados_origen=item.confirmados_origen,
            confirmados_destino=item.confirmados_destino,
            creado_en=item.creado_en,
            enviado_en=item.enviado_en,
            completado_en=item.completado_en,
            detalles=[
                DetalleTransferenciaResponse.model_validate(d) for d in transferencia.detalles
            ],
        )
