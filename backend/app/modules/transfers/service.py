import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.modules.assets.historial_service import HistorialService
from app.modules.assets.models import Activo, Etiqueta
from app.modules.auth.models import Usuario
from app.modules.personas.models import Persona
from app.modules.personas.service import PersonasService
from app.modules.transfers.models import (
    TIPO_DEPOSITO,
    TIPO_PERSONA,
    DetalleTransferencia,
    Transferencia,
)
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
        self.personas = PersonasService(db)

    def create(self, data: TransferenciaCreate, user: Usuario) -> TransferenciaResponse:
        tipo = data.tipo or TIPO_DEPOSITO
        if tipo == TIPO_PERSONA:
            return self._create_entrega_persona(data, user)
        return self._create_deposito(data, user)

    def _create_deposito(self, data: TransferenciaCreate, user: Usuario) -> TransferenciaResponse:
        assert data.deposito_destino_id is not None
        assert data.ubicacion_destino_id is not None

        origen = self._get_deposito_activo(data.deposito_origen_id)
        destino = self._get_deposito_activo(data.deposito_destino_id)
        ubicacion = self._get_ubicacion_en_deposito(data.ubicacion_destino_id, destino.id)

        unidades = self._preparar_unidades(
            data, origen.id, excluir_ubicacion_id=ubicacion.id
        )
        if not unidades:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No hay unidades disponibles en el depósito de origen para este movimiento",
            )

        transferencia = Transferencia(
            tipo=TIPO_DEPOSITO,
            deposito_origen_id=origen.id,
            deposito_destino_id=destino.id,
            ubicacion_destino_id=ubicacion.id,
            persona_destino_id=None,
            usuario_id=user.id,
            estado=ESTADO_COMPLETADA,
            notas=data.notas,
        )
        self.db.add(transferencia)
        self.db.flush()
        self._agregar_detalles(transferencia.id, unidades)
        self.db.flush()

        detalles = list(
            self.db.scalars(
                select(DetalleTransferencia).where(
                    DetalleTransferencia.transferencia_id == transferencia.id
                )
            ).all()
        )
        activo_ids = [d.activo_id for d in detalles]
        activos = {
            a.id: a
            for a in self.db.scalars(select(Activo).where(Activo.id.in_(activo_ids))).all()
        }

        now = datetime.now(UTC)
        for detalle in detalles:
            detalle.confirmado_origen = True
            detalle.confirmado_destino = True
            activo = activos.get(detalle.activo_id)
            if not activo:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Activo {detalle.activo_id} no encontrado",
                )
            self._aplicar_movimiento_deposito(detalle, activo, ubicacion)

        self._sincronizar_ubicacion_activos(list(activos.values()))
        self._registrar_historial_movimiento(
            transferencia=transferencia,
            detalles=detalles,
            user=user,
            accion=HistorialService.ACCION_TRANSFERENCIA,
            deposito_origen_nombre=origen.nombre,
            deposito_destino_nombre=destino.nombre,
            ubicacion_codigo=ubicacion.codigo,
        )

        transferencia.estado = ESTADO_COMPLETADA
        transferencia.enviado_en = now
        transferencia.completado_en = now
        self.db.commit()
        return self.get(transferencia.id)

    def _create_entrega_persona(
        self, data: TransferenciaCreate, user: Usuario
    ) -> TransferenciaResponse:
        assert data.persona_destino_id is not None
        origen = self._get_deposito_activo(data.deposito_origen_id)
        persona = self.personas.get_activa(data.persona_destino_id)
        unidades = self._preparar_unidades(data, origen.id)

        transferencia = Transferencia(
            tipo=TIPO_PERSONA,
            deposito_origen_id=origen.id,
            deposito_destino_id=None,
            ubicacion_destino_id=None,
            persona_destino_id=persona.id,
            usuario_id=user.id,
            estado=ESTADO_COMPLETADA,
            notas=data.notas,
        )
        self.db.add(transferencia)
        self.db.flush()
        self._agregar_detalles(transferencia.id, unidades)
        self.db.flush()

        detalles = list(
            self.db.scalars(
                select(DetalleTransferencia).where(
                    DetalleTransferencia.transferencia_id == transferencia.id
                )
            ).all()
        )
        if data.epcs:
            epcs = self._normalize_epcs(data.epcs)
            self._match_epcs(detalles, epcs, etapa="entrega")

        now = datetime.now(UTC)
        for detalle in detalles:
            detalle.confirmado_origen = True
            detalle.confirmado_destino = True
            self._aplicar_entrega_persona(detalle, persona)

        self._registrar_historial_movimiento(
            transferencia=transferencia,
            detalles=detalles,
            user=user,
            accion=HistorialService.ACCION_ENTREGA_PERSONA,
            deposito_origen_nombre=origen.nombre,
            persona_nombre=persona.nombre,
        )

        transferencia.estado = ESTADO_COMPLETADA
        transferencia.enviado_en = now
        transferencia.completado_en = now
        self.db.commit()
        return self.get(transferencia.id)

    def _preparar_unidades(
        self,
        data: TransferenciaCreate,
        deposito_origen_id: uuid.UUID,
        *,
        excluir_ubicacion_id: uuid.UUID | None = None,
    ) -> list[tuple[Activo, Etiqueta | None, str | None]]:
        lineas = self._lineas_efectivas(data, deposito_origen_id)
        activo_ids = list(dict.fromkeys(aid for aid, _, _ in lineas))
        activos = self._load_activos(activo_ids)
        self._lock_etiquetas(activo_ids)
        if len(activos) != len(activo_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uno o más artículos no existen o están inactivos",
            )
        activos_by_id = {a.id: a for a in activos}
        unidades: list[tuple[Activo, Etiqueta | None, str | None]] = []
        for activo_id, cantidad, ubicacion_origen_id in lineas:
            activo = activos_by_id[activo_id]
            if ubicacion_origen_id is not None:
                if not self._ubicacion_en_deposito(ubicacion_origen_id, deposito_origen_id):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"La ubicación de origen no pertenece al depósito "
                            f"para el artículo {activo.numero_patrimonial}"
                        ),
                    )
                if (
                    excluir_ubicacion_id is not None
                    and ubicacion_origen_id == excluir_ubicacion_id
                ):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"El artículo {activo.numero_patrimonial}: la ubicación de origen "
                            "no puede ser la misma que la de destino"
                        ),
                    )
            tomadas = self._tomar_unidades(
                activo,
                deposito_origen_id,
                cantidad,
                excluir_ubicacion_id=excluir_ubicacion_id,
                solo_ubicacion_id=ubicacion_origen_id,
            )
            unidades.extend(tomadas)
        return unidades

    def _agregar_detalles(
        self,
        transferencia_id: uuid.UUID,
        unidades: list[tuple[Activo, Etiqueta | None, str | None]],
    ) -> None:
        for activo, etiqueta, epc in unidades:
            self.db.add(
                DetalleTransferencia(
                    transferencia_id=transferencia_id,
                    activo_id=activo.id,
                    etiqueta_id=etiqueta.id if etiqueta else None,
                    epc=epc,
                    numero_patrimonial=activo.numero_patrimonial,
                    descripcion=activo.descripcion,
                    ubicacion_origen_id=self._ubicacion_efectiva(etiqueta, activo),
                )
            )

    def _aplicar_entrega_persona(
        self,
        detalle: DetalleTransferencia,
        persona: Persona,
    ) -> None:
        activo = self.db.get(Activo, detalle.activo_id)
        if not activo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Activo {detalle.activo_id} no encontrado",
            )
        etiqueta = self._etiqueta_de_detalle(detalle)
        if etiqueta is not None:
            etiqueta.ubicacion_id = None
            etiqueta.persona_custodio_id = persona.id
            self._sincronizar_custodia_activo(activo)
        else:
            activo.ubicacion_id = None
            activo.persona_custodio_id = persona.id

    def _aplicar_movimiento_deposito(
        self,
        detalle: DetalleTransferencia,
        activo: Activo,
        ubicacion: Ubicacion,
    ) -> None:
        etiqueta = self._etiqueta_de_detalle(detalle)
        if etiqueta is not None:
            etiqueta.ubicacion_id = ubicacion.id
            etiqueta.persona_custodio_id = None
        else:
            activo.ubicacion_id = ubicacion.id
            activo.persona_custodio_id = None

    def get(self, transferencia_id: uuid.UUID) -> TransferenciaResponse:
        transferencia = self._get_or_404(transferencia_id)
        return self._to_response(transferencia)

    def list_transferencias(
        self,
        *,
        estado: str | None = None,
        tipo: str | None = None,
        deposito_origen_id: uuid.UUID | None = None,
        deposito_destino_id: uuid.UUID | None = None,
        persona_destino_id: uuid.UUID | None = None,
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
        if tipo is not None:
            stmt = stmt.where(Transferencia.tipo == tipo)
        if deposito_origen_id is not None:
            stmt = stmt.where(Transferencia.deposito_origen_id == deposito_origen_id)
        if deposito_destino_id is not None:
            stmt = stmt.where(Transferencia.deposito_destino_id == deposito_destino_id)
        if persona_destino_id is not None:
            stmt = stmt.where(Transferencia.persona_destino_id == persona_destino_id)

        rows = list(self.db.scalars(stmt).all())
        nombres = self._nombres_personas(
            {r.persona_destino_id for r in rows if r.persona_destino_id}
        )
        nombres_usuarios = self._nombres_usuarios({r.usuario_id for r in rows if r.usuario_id})
        return [self._to_list_item(row, nombres, nombres_usuarios) for row in rows]

    def confirmar_origen(
        self, transferencia_id: uuid.UUID, data: TransferenciaEpcsRequest
    ) -> TransferenciaResponse:
        transferencia = self._get_or_404(transferencia_id)
        if transferencia.tipo != TIPO_DEPOSITO:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Las entregas a persona se completan al crearlas; no requieren confirmación",
            )
        if transferencia.estado != ESTADO_PENDIENTE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Solo se puede confirmar origen en movimientos pendientes (legado)",
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
        if transferencia.tipo != TIPO_DEPOSITO:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Las entregas a persona se completan al crearlas; no requieren confirmación",
            )
        if transferencia.estado != ESTADO_EN_TRANSITO:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Solo se puede confirmar destino en movimientos en tránsito (legado)",
            )
        if transferencia.deposito_destino_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El movimiento no tiene depósito destino",
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
            self._aplicar_movimiento_deposito(detalle, activo, ubicacion)

        self._sincronizar_ubicacion_activos(list(activos.values()))

        origen = self.db.get(Deposito, transferencia.deposito_origen_id)
        destino = self.db.get(Deposito, transferencia.deposito_destino_id)
        self._registrar_historial_movimiento(
            transferencia=transferencia,
            detalles=list(transferencia.detalles),
            user=user,
            accion=HistorialService.ACCION_TRANSFERENCIA,
            deposito_origen_nombre=origen.nombre if origen else None,
            deposito_destino_nombre=destino.nombre if destino else None,
            ubicacion_codigo=ubicacion.codigo,
        )

        transferencia.ubicacion_destino_id = ubicacion.id
        transferencia.estado = ESTADO_COMPLETADA
        transferencia.completado_en = datetime.now(UTC)
        self.db.commit()
        return self.get(transferencia.id)

    def cancelar(self, transferencia_id: uuid.UUID) -> TransferenciaResponse:
        transferencia = self._get_or_404(transferencia_id)
        if transferencia.tipo == TIPO_PERSONA:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Las entregas a persona ya quedaron registradas; no se pueden cancelar",
            )
        if transferencia.estado not in ESTADOS_ABIERTOS:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Solo se pueden cancelar movimientos pendientes o en tránsito",
            )
        transferencia.estado = ESTADO_CANCELADA
        self.db.commit()
        return self.get(transferencia.id)

    def _registrar_historial_movimiento(
        self,
        *,
        transferencia: Transferencia,
        detalles: list[DetalleTransferencia],
        user: Usuario,
        accion: str,
        deposito_origen_nombre: str | None = None,
        deposito_destino_nombre: str | None = None,
        ubicacion_codigo: str | None = None,
        persona_nombre: str | None = None,
    ) -> None:
        """Un evento de Actividad por artículo, con cantidad agregada."""
        por_activo: dict[uuid.UUID, int] = {}
        for detalle in detalles:
            por_activo[detalle.activo_id] = por_activo.get(detalle.activo_id, 0) + 1

        for activo_id, cantidad in por_activo.items():
            cambios: dict = {
                "movimiento_id": str(transferencia.id),
                "transferencia_id": str(transferencia.id),
                "deposito_origen_id": str(transferencia.deposito_origen_id),
                "cantidad": cantidad,
            }
            if deposito_origen_nombre:
                cambios["deposito_origen"] = deposito_origen_nombre
            if transferencia.deposito_destino_id is not None:
                cambios["deposito_destino_id"] = str(transferencia.deposito_destino_id)
            if deposito_destino_nombre:
                cambios["deposito_destino"] = deposito_destino_nombre
            if ubicacion_codigo:
                cambios["ubicacion_codigo"] = ubicacion_codigo
            if transferencia.persona_destino_id is not None:
                cambios["persona_destino_id"] = str(transferencia.persona_destino_id)
            if persona_nombre:
                cambios["persona_nombre"] = persona_nombre

            self.historial.registrar(
                activo_id=activo_id,
                accion=accion,
                usuario=user,
                cambios=cambios,
                commit=False,
            )

    def _get_or_404(self, transferencia_id: uuid.UUID) -> Transferencia:
        stmt = (
            select(Transferencia)
            .options(selectinload(Transferencia.detalles))
            .where(Transferencia.id == transferencia_id)
        )
        transferencia = self.db.scalars(stmt).first()
        if not transferencia:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Movimiento no encontrado"
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

    def _lineas_efectivas(
        self, data: TransferenciaCreate, deposito_origen_id: uuid.UUID
    ) -> list[tuple[uuid.UUID, int, uuid.UUID | None]]:
        """(activo_id, cantidad, ubicacion_origen_id)."""
        if data.lineas:
            merged: dict[tuple[uuid.UUID, uuid.UUID | None], int] = {}
            for linea in data.lineas:
                key = (linea.activo_id, linea.ubicacion_origen_id)
                n = merged.get(key, 0) + linea.cantidad
                if n > 500:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="La cantidad máxima por artículo es 500",
                    )
                merged[key] = n
            return [(aid, cant, ubi) for (aid, ubi), cant in merged.items()]
        return [
            (aid, self._unidades_disponibles_count(aid, deposito_origen_id), None)
            for aid in dict.fromkeys(data.activo_ids)
        ]

    def _ubicacion_efectiva(self, etiqueta: Etiqueta | None, activo: Activo) -> uuid.UUID | None:
        if etiqueta is not None and etiqueta.ubicacion_id is not None:
            return etiqueta.ubicacion_id
        return activo.ubicacion_id

    def _ubicacion_en_deposito(self, ubicacion_id: uuid.UUID | None, deposito_id: uuid.UUID) -> bool:
        if ubicacion_id is None:
            return False
        stmt = (
            select(Ubicacion.id)
            .join(Sector, Ubicacion.sector_id == Sector.id)
            .where(
                Ubicacion.id == ubicacion_id,
                Sector.deposito_id == deposito_id,
                Ubicacion.activo.is_(True),
                Sector.activo.is_(True),
            )
        )
        return self.db.scalars(stmt).first() is not None

    def _etiquetas_en_orden_abierta(self) -> set[uuid.UUID]:
        # Movimientos se completan al crear: no reservar stock entre requests.
        # Órdenes abiertas legadas no deben bloquear unidades.
        return set()

    def _epcs_en_orden_abierta(self) -> set[str]:
        return set()

    def _lock_etiquetas(self, activo_ids: list[uuid.UUID]) -> None:
        if not activo_ids:
            return
        stmt = (
            select(Etiqueta.id)
            .where(Etiqueta.activo_id.in_(activo_ids), Etiqueta.estado == "activa")
            .order_by(Etiqueta.id)
            .with_for_update()
        )
        self.db.scalars(stmt).all()

    def _unidades_disponibles(
        self,
        activo: Activo,
        deposito_origen_id: uuid.UUID,
        *,
        excluir_ubicacion_id: uuid.UUID | None = None,
        solo_ubicacion_id: uuid.UUID | None = None,
    ) -> list[tuple[Activo, Etiqueta | None, str | None]]:
        ocupadas = self._etiquetas_en_orden_abierta()
        epcs_ocupados = self._epcs_en_orden_abierta()
        etiquetas = list(
            self.db.scalars(
                select(Etiqueta)
                .where(Etiqueta.activo_id == activo.id, Etiqueta.estado == "activa")
                .order_by(Etiqueta.creado_en.asc(), Etiqueta.id.asc())
            ).all()
        )
        disponibles: list[tuple[Activo, Etiqueta | None, str | None]] = []
        for et in etiquetas:
            if et.id in ocupadas:
                continue
            if et.persona_custodio_id is not None:
                continue
            epc = (et.epc or "").strip().upper()
            if epc and epc in epcs_ocupados:
                continue
            ubi_efectiva = self._ubicacion_efectiva(et, activo)
            if not self._ubicacion_en_deposito(ubi_efectiva, deposito_origen_id):
                continue
            if solo_ubicacion_id is not None and ubi_efectiva != solo_ubicacion_id:
                continue
            if excluir_ubicacion_id is not None and ubi_efectiva == excluir_ubicacion_id:
                continue
            disponibles.append((activo, et, epc or None))
        if disponibles or etiquetas:
            return disponibles
        if activo.persona_custodio_id is not None:
            return []
        if activo.epc and (activo.epc or "").strip().upper() not in epcs_ocupados:
            if self._ubicacion_en_deposito(activo.ubicacion_id, deposito_origen_id):
                if solo_ubicacion_id is not None and activo.ubicacion_id != solo_ubicacion_id:
                    return []
                if (
                    excluir_ubicacion_id is not None
                    and activo.ubicacion_id == excluir_ubicacion_id
                ):
                    return []
                return [(activo, None, (activo.epc or "").strip().upper())]
        return []

    def _unidades_disponibles_count(self, activo_id: uuid.UUID, deposito_origen_id: uuid.UUID) -> int:
        activo = self.db.get(Activo, activo_id)
        if not activo or not activo.activo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uno o más artículos no existen o están inactivos",
            )
        n = len(self._unidades_disponibles(activo, deposito_origen_id))
        if n < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El artículo {activo.numero_patrimonial} no tiene unidades en el origen",
            )
        return n

    def _tomar_unidades(
        self,
        activo: Activo,
        deposito_origen_id: uuid.UUID,
        cantidad: int,
        *,
        excluir_ubicacion_id: uuid.UUID | None = None,
        solo_ubicacion_id: uuid.UUID | None = None,
    ) -> list[tuple[Activo, Etiqueta | None, str | None]]:
        disponibles = self._unidades_disponibles(
            activo,
            deposito_origen_id,
            excluir_ubicacion_id=excluir_ubicacion_id,
            solo_ubicacion_id=solo_ubicacion_id,
        )
        if len(disponibles) < cantidad:
            # Sin filtro de destino: ¿hay stock que solo está ya en el destino?
            todas = self._unidades_disponibles(
                activo, deposito_origen_id, solo_ubicacion_id=solo_ubicacion_id
            )
            if (
                excluir_ubicacion_id is not None
                and solo_ubicacion_id is None
                and len(disponibles) == 0
                and len(todas) > 0
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"El artículo {activo.numero_patrimonial} ya está en la ubicación "
                        "destino. Elegí otro sector/ubicación."
                    ),
                )
            if solo_ubicacion_id is not None and len(disponibles) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"El artículo {activo.numero_patrimonial} no tiene unidades "
                        "en la ubicación de origen indicada"
                    ),
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"El artículo {activo.numero_patrimonial} tiene {len(disponibles)} "
                    f"unidad(es) disponible(s) en origen; pediste {cantidad}"
                ),
            )
        return disponibles[:cantidad]

    def _etiqueta_de_detalle(self, detalle: DetalleTransferencia) -> Etiqueta | None:
        if detalle.etiqueta_id:
            return self.db.get(Etiqueta, detalle.etiqueta_id)
        if detalle.epc:
            return self.db.scalars(
                select(Etiqueta).where(Etiqueta.epc == detalle.epc.strip().upper())
            ).first()
        return None

    def _sincronizar_ubicacion_activos(self, activos: list[Activo]) -> None:
        """Si todas las unidades activas coinciden en ubicación, el SKU sigue esa ubicación."""
        for activo in activos:
            etiquetas = list(
                self.db.scalars(
                    select(Etiqueta).where(
                        Etiqueta.activo_id == activo.id, Etiqueta.estado == "activa"
                    )
                ).all()
            )
            if not etiquetas:
                continue
            locs = {self._ubicacion_efectiva(et, activo) for et in etiquetas}
            if len(locs) == 1:
                activo.ubicacion_id = next(iter(locs))
            custodios = {et.persona_custodio_id for et in etiquetas}
            if len(custodios) == 1:
                activo.persona_custodio_id = next(iter(custodios))
            else:
                activo.persona_custodio_id = None

    def _sincronizar_custodia_activo(self, activo: Activo) -> None:
        etiquetas = list(
            self.db.scalars(
                select(Etiqueta).where(
                    Etiqueta.activo_id == activo.id, Etiqueta.estado == "activa"
                )
            ).all()
        )
        if not etiquetas:
            return
        locs = {et.ubicacion_id for et in etiquetas}
        if len(locs) == 1:
            activo.ubicacion_id = next(iter(locs))
        else:
            # Unidades mezcladas: no forzar ubicación única en el SKU
            if None in locs and any(l is not None for l in locs):
                pass
            elif len(locs) == 1:
                activo.ubicacion_id = next(iter(locs))
        custodios = {et.persona_custodio_id for et in etiquetas}
        if len(custodios) == 1:
            activo.persona_custodio_id = next(iter(custodios))
            if next(iter(custodios)) is not None and all(et.ubicacion_id is None for et in etiquetas):
                activo.ubicacion_id = None
        else:
            activo.persona_custodio_id = None

    def _load_activos(self, activo_ids: list[uuid.UUID]) -> list[Activo]:
        stmt = (
            select(Activo)
            .options(joinedload(Activo.ubicacion).joinedload(Ubicacion.sector))
            .where(Activo.id.in_(activo_ids), Activo.activo.is_(True))
        )
        by_id = {a.id: a for a in self.db.scalars(stmt).unique().all()}
        return [by_id[aid] for aid in activo_ids if aid in by_id]

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
                    "Todos los activos del movimiento deben tener EPC para confirmar "
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

    def _nombres_personas(self, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not ids:
            return {}
        rows = self.db.scalars(select(Persona).where(Persona.id.in_(ids))).all()
        return {p.id: p.nombre for p in rows}

    def _nombres_usuarios(self, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not ids:
            return {}
        rows = self.db.scalars(select(Usuario).where(Usuario.id.in_(ids))).all()
        return {u.id: u.nombre for u in rows}

    def _to_list_item(
        self,
        transferencia: Transferencia,
        nombres: dict[uuid.UUID, str] | None = None,
        nombres_usuarios: dict[uuid.UUID, str] | None = None,
    ) -> TransferenciaListItem:
        confirmados_origen = sum(1 for d in transferencia.detalles if d.confirmado_origen)
        confirmados_destino = sum(1 for d in transferencia.detalles if d.confirmado_destino)
        nombre = None
        if transferencia.persona_destino_id:
            if nombres and transferencia.persona_destino_id in nombres:
                nombre = nombres[transferencia.persona_destino_id]
            else:
                persona = self.db.get(Persona, transferencia.persona_destino_id)
                nombre = persona.nombre if persona else None
        usuario_nombre = None
        if transferencia.usuario_id:
            if nombres_usuarios and transferencia.usuario_id in nombres_usuarios:
                usuario_nombre = nombres_usuarios[transferencia.usuario_id]
            else:
                user = self.db.get(Usuario, transferencia.usuario_id)
                usuario_nombre = user.nombre if user else None
        return TransferenciaListItem(
            id=transferencia.id,
            tipo=transferencia.tipo or TIPO_DEPOSITO,
            deposito_origen_id=transferencia.deposito_origen_id,
            deposito_destino_id=transferencia.deposito_destino_id,
            ubicacion_destino_id=transferencia.ubicacion_destino_id,
            persona_destino_id=transferencia.persona_destino_id,
            persona_destino_nombre=nombre,
            usuario_id=transferencia.usuario_id,
            usuario_nombre=usuario_nombre,
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
            tipo=item.tipo,
            deposito_origen_id=item.deposito_origen_id,
            deposito_destino_id=item.deposito_destino_id,
            ubicacion_destino_id=item.ubicacion_destino_id,
            persona_destino_id=item.persona_destino_id,
            persona_destino_nombre=item.persona_destino_nombre,
            usuario_id=item.usuario_id,
            usuario_nombre=item.usuario_nombre,
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
