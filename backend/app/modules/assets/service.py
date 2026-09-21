import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.modules.assets.historial_service import HistorialService
from app.modules.assets.models import Activo, Categoria
from app.modules.assets.repository import ActivoRepository, CategoriaRepository, EtiquetaRepository
from app.modules.assets.schemas import (
    ActivoCreate,
    ActivoResponse,
    ActivoUpdate,
    ActivoUbicacionResumen,
    CategoriaCreate,
    CategoriaUpdate,
)
from app.modules.auth.models import Usuario


class CategoriaService:
    def __init__(self, db: Session):
        self.repository = CategoriaRepository(db)

    def list_categorias(self, include_inactive: bool = False) -> list[Categoria]:
        return self.repository.get_all(include_inactive=include_inactive)

    def get_categoria(self, categoria_id: uuid.UUID) -> Categoria:
        categoria = self.repository.get_by_id(categoria_id)
        if not categoria:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Categoría no encontrada"
            )
        return categoria

    def create_categoria(self, data: CategoriaCreate) -> Categoria:
        existing = self.repository.get_by_nombre(data.nombre)
        if existing is not None:
            if existing.activa:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ya existe una categoría con ese nombre",
                )
            self.repository.delete(existing)
        categoria = Categoria(nombre=data.nombre, descripcion=data.descripcion)
        return self.repository.create(categoria)

    def update_categoria(self, categoria_id: uuid.UUID, data: CategoriaUpdate) -> Categoria:
        categoria = self.get_categoria(categoria_id)
        if data.nombre and data.nombre != categoria.nombre:
            existing = self.repository.get_by_nombre(data.nombre)
            if existing is not None and existing.id != categoria.id:
                if existing.activa:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Ya existe una categoría con ese nombre",
                    )
                self.repository.delete(existing)
            categoria.nombre = data.nombre
        if data.descripcion is not None:
            categoria.descripcion = data.descripcion
        if data.activa is not None:
            categoria.activa = data.activa
        return self.repository.update(categoria)

    def delete_categoria(self, categoria_id: uuid.UUID) -> None:
        from sqlalchemy import func, select

        from app.modules.assets.models import Activo

        categoria = self.get_categoria(categoria_id)
        en_uso = self.repository.db.scalar(
            select(func.count()).select_from(Activo).where(Activo.categoria_id == categoria_id)
        )
        if en_uso:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"No se puede eliminar: hay {en_uso} artículo(s) con esta categoría. "
                    "Reasigná o eliminá esos artículos primero."
                ),
            )
        self.repository.delete(categoria)


class ActivoService:
    def __init__(self, db: Session):
        self.repository = ActivoRepository(db)
        self.categoria_repository = CategoriaRepository(db)
        self.etiqueta_repository = EtiquetaRepository(db)
        self.historial = HistorialService(db)

    def _attach_etiqueta_epc(self, activo: Activo, epc: str) -> None:
        """Crea una etiqueta activa con el EPC dado (no escribe activos.epc)."""
        from app.modules.assets.models import Etiqueta

        normalized = (epc or "").strip().upper()
        if not normalized:
            return
        existing = self.etiqueta_repository.get_by_epc(normalized)
        if existing is not None:
            if existing.activo_id == activo.id and existing.estado == "activa":
                return
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un activo con ese EPC",
            )
        etiqueta = Etiqueta(
            id=uuid.uuid4(),
            activo_id=activo.id,
            epc=normalized,
            serial_hex=None,
            estado="activa",
            impresa=False,
            ubicacion_id=activo.ubicacion_id,
        )
        self.etiqueta_repository.add_many([etiqueta])
        self.repository.db.commit()

    def _resumen_desde_ubicacion(self, ubicacion) -> ActivoUbicacionResumen | None:
        if not ubicacion or not ubicacion.activo:
            return None
        sector = ubicacion.sector
        if not sector or not sector.activo:
            return None
        deposito = sector.deposito
        if not deposito or not deposito.activo:
            return None
        return ActivoUbicacionResumen(
            ubicacion_id=ubicacion.id,
            ubicacion_codigo=ubicacion.codigo,
            sector_id=sector.id,
            sector_nombre=sector.nombre,
            deposito_id=deposito.id,
            deposito_nombre=deposito.nombre,
        )

    def _load_ubicaciones_map(self, ids: set[uuid.UUID]):
        from sqlalchemy import select
        from sqlalchemy.orm import joinedload

        from app.modules.warehouses.models import Sector, Ubicacion

        if not ids:
            return {}
        stmt = (
            select(Ubicacion)
            .options(joinedload(Ubicacion.sector).joinedload(Sector.deposito))
            .where(Ubicacion.id.in_(list(ids)))
        )
        return {u.id: u for u in self.repository.db.scalars(stmt).unique().all()}

    def _ubicacion_resumen(
        self,
        activo: Activo,
        etiquetas: list | None = None,
        ubicaciones_by_id: dict | None = None,
    ) -> ActivoUbicacionResumen | None:
        """Ubicación del SKU: activos.ubicacion_id o, si falta, la de las unidades RFID."""
        from collections import Counter

        directo = self._resumen_desde_ubicacion(activo.ubicacion)
        if directo:
            return directo
        loc_ids = [et.ubicacion_id for et in (etiquetas or []) if getattr(et, "ubicacion_id", None)]
        if not loc_ids:
            return None
        winner = Counter(loc_ids).most_common(1)[0][0]
        cache = ubicaciones_by_id or {}
        ubi = cache.get(winner)
        if ubi is None:
            ubi = self._load_ubicaciones_map({winner}).get(winner)
        return self._resumen_desde_ubicacion(ubi)

    def _to_response(
        self,
        activo: Activo,
        stock: int | None = None,
        epcs: list[str] | None = None,
        etiquetas: list | None = None,
        ubicaciones_by_id: dict | None = None,
    ) -> ActivoResponse:
        # Construir dict: la relación ORM `ubicacion` no matchea ActivoUbicacionResumen.
        data = ActivoResponse.model_validate(
            {
                "id": activo.id,
                "numero_patrimonial": activo.numero_patrimonial,
                "descripcion": activo.descripcion,
                "categoria_id": activo.categoria_id,
                "epc": activo.epc,
                "datos_tecnicos": activo.datos_tecnicos,
                "activo": activo.activo,
                "serializado": bool(getattr(activo, "serializado", False)),
                "creado_en": activo.creado_en,
                "actualizado_en": activo.actualizado_en,
                "categoria": activo.categoria,
                "ubicacion": None,
            }
        )
        if etiquetas is None:
            etiquetas = self.etiqueta_repository.list_activas_by_activo_ids([activo.id])
        if epcs is None:
            epcs = [e.epc.strip().upper() for e in etiquetas if e.epc]
        # Incluir EPC legado del artículo si no está en etiquetas
        legacy = (activo.epc or "").strip().upper()
        if legacy and legacy not in epcs:
            epcs = [*epcs, legacy]
        data.epcs = epcs
        if stock is None:
            stock = len(epcs) if epcs else self.etiqueta_repository.count_activas_by_activo(
                activo.id
            )
        data.stock_etiquetas = stock
        # Representativo para clientes que aún usan un solo `epc`
        if not data.epc and epcs:
            data.epc = epcs[0]
        data.ubicacion = self._ubicacion_resumen(
            activo, etiquetas=etiquetas, ubicaciones_by_id=ubicaciones_by_id
        )
        return data

    def list_activos(
        self,
        categoria_id: uuid.UUID | None = None,
        search: str | None = None,
        include_inactive: bool = False,
    ) -> list[ActivoResponse]:
        activos = self.repository.get_all(
            categoria_id=categoria_id,
            search=search,
            include_inactive=include_inactive,
        )
        counts = self.etiqueta_repository.counts_activas([a.id for a in activos])
        etiquetas = self.etiqueta_repository.list_activas_by_activo_ids([a.id for a in activos])
        epcs_by_activo: dict[uuid.UUID, list[str]] = {}
        ets_by_activo: dict[uuid.UUID, list] = {}
        loc_ids: set[uuid.UUID] = set()
        for et in etiquetas:
            ets_by_activo.setdefault(et.activo_id, []).append(et)
            epcs_by_activo.setdefault(et.activo_id, []).append(et.epc.strip().upper())
            if et.ubicacion_id:
                loc_ids.add(et.ubicacion_id)
        ubicaciones = self._load_ubicaciones_map(loc_ids)
        return [
            self._to_response(
                a,
                stock=counts.get(a.id, 0),
                epcs=epcs_by_activo.get(a.id, []),
                etiquetas=ets_by_activo.get(a.id, []),
                ubicaciones_by_id=ubicaciones,
            )
            for a in activos
        ]

    def get_activo(self, activo_id: uuid.UUID) -> Activo:
        activo = self.repository.get_by_id(activo_id)
        if not activo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Activo no encontrado"
            )
        return activo

    def get_activo_response(self, activo_id: uuid.UUID) -> ActivoResponse:
        return self._to_response(self.get_activo(activo_id))

    def lookup_by_epc(self, epc: str):
        from app.modules.assets.schemas import ActivoLookupResponse

        normalized = (epc or "").strip().upper()
        if not normalized:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="EPC vacío",
            )

        activo = self.repository.get_by_epc(normalized)
        if not activo:
            return ActivoLookupResponse(
                encontrado=False,
                epc_consultado=normalized,
                mensaje="No hay activo registrado con ese EPC",
            )

        resp = self._to_response(activo)
        return ActivoLookupResponse(
            encontrado=True,
            epc_consultado=normalized,
            activo=resp,
            ubicacion=resp.ubicacion,
            mensaje=None,
        )

    def lookup_by_serie_fisica(self, serie: str):
        from app.modules.assets.schemas import ActivoLookupSerieResponse

        normalized = (serie or "").strip().upper()
        if not normalized:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Serie física vacía",
            )

        etiqueta = self.etiqueta_repository.get_by_serie_fisica(normalized)
        if not etiqueta or not etiqueta.activo:
            return ActivoLookupSerieResponse(
                encontrado=False,
                serie_consultada=normalized,
                mensaje="No hay unidad registrada con esa serie de fábrica",
            )

        resp = self._to_response(etiqueta.activo)
        return ActivoLookupSerieResponse(
            encontrado=True,
            serie_consultada=normalized,
            activo=resp,
            etiqueta_id=etiqueta.id,
            epc=etiqueta.epc,
            ubicacion=resp.ubicacion,
            mensaje=None,
        )

    def lookup_by_epcs(self, epcs: list[str]):
        from app.modules.assets.schemas import (
            ActivoLookupEpcsResponse,
            ActivoLookupResponse,
        )

        normalized: list[str] = []
        seen: set[str] = set()
        for raw in epcs:
            epc = (raw or "").strip().upper()
            if not epc or epc in seen:
                continue
            seen.add(epc)
            normalized.append(epc)

        if not normalized:
            return ActivoLookupEpcsResponse(consultados=0, encontrados=[], no_registrados=[])

        by_epc = self.repository.get_by_epcs(normalized)
        # Precargar ubicaciones vía _to_response (mismo camino que by-epc).
        encontrados: list[ActivoLookupResponse] = []
        no_registrados: list[str] = []
        response_cache: dict = {}
        for epc in normalized:
            activo = by_epc.get(epc)
            if activo is None:
                no_registrados.append(epc)
                continue
            cache_key = str(activo.id)
            if cache_key not in response_cache:
                response_cache[cache_key] = self._to_response(activo)
            resp = response_cache[cache_key]
            encontrados.append(
                ActivoLookupResponse(
                    encontrado=True,
                    epc_consultado=epc,
                    activo=resp,
                    ubicacion=resp.ubicacion,
                    mensaje=None,
                )
            )
        return ActivoLookupEpcsResponse(
            consultados=len(normalized),
            encontrados=encontrados,
            no_registrados=no_registrados,
        )

    def create_activo(self, data: ActivoCreate, user: Usuario) -> ActivoResponse:
        categoria = self.categoria_repository.get_by_id(data.categoria_id)
        if not categoria or not categoria.activa:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Categoría inválida"
            )

        existing = self.repository.get_by_numero_patrimonial(data.numero_patrimonial)
        if existing is not None:
            if existing.activo:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ya existe un activo con ese número patrimonial",
                )
            self._purge_ghost_activo(existing)

        if data.epc:
            epc_owner = self.repository.get_by_epc(data.epc)
            if epc_owner is not None:
                if epc_owner.activo:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Ya existe un activo con ese EPC",
                    )
                self._purge_ghost_activo(epc_owner)

        activo = Activo(
            numero_patrimonial=data.numero_patrimonial,
            descripcion=data.descripcion,
            categoria_id=data.categoria_id,
            epc=None,  # identidad RFID solo en `etiquetas`
            datos_tecnicos=data.datos_tecnicos,
            serializado=bool(data.serializado),
            creado_por_id=user.id,
        )
        created = self.repository.create(activo)
        if data.epc:
            self._attach_etiqueta_epc(created, data.epc.strip().upper())
        self.historial.registrar(
            activo_id=created.id,
            accion=HistorialService.ACCION_CREACION,
            usuario=user,
            cambios={
                "numero_patrimonial": created.numero_patrimonial,
                "descripcion": created.descripcion,
                "categoria_id": str(created.categoria_id),
                "serializado": created.serializado,
                **({"epc": data.epc.strip().upper()} if data.epc else {}),
            },
        )
        if data.ubicacion_id is not None:
            from app.modules.warehouses.asignacion_service import AsignacionService
            from app.modules.warehouses.schemas import AsignacionUbicacionRequest

            AsignacionService(self.repository.db).asignar_ubicacion(
                created.id,
                AsignacionUbicacionRequest(ubicacion_id=data.ubicacion_id),
                user,
            )
            created = self.repository.get_by_id(created.id) or created
        return self._to_response(created)

    def update_activo(
        self, activo_id: uuid.UUID, data: ActivoUpdate, user: Usuario
    ) -> ActivoResponse:
        activo = self.get_activo(activo_id)
        cambios: dict[str, dict] = {}

        if data.numero_patrimonial and data.numero_patrimonial != activo.numero_patrimonial:
            existing = self.repository.get_by_numero_patrimonial(data.numero_patrimonial)
            if existing is not None and existing.id != activo.id:
                if existing.activo:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Ya existe un activo con ese número patrimonial",
                    )
                self._purge_ghost_activo(existing)
            cambios["numero_patrimonial"] = {
                "anterior": activo.numero_patrimonial,
                "nuevo": data.numero_patrimonial,
            }
            activo.numero_patrimonial = data.numero_patrimonial

        if data.descripcion is not None and data.descripcion != activo.descripcion:
            cambios["descripcion"] = {"anterior": activo.descripcion, "nuevo": data.descripcion}
            activo.descripcion = data.descripcion

        if data.categoria_id is not None and data.categoria_id != activo.categoria_id:
            categoria = self.categoria_repository.get_by_id(data.categoria_id)
            if not categoria or not categoria.activa:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Categoría inválida"
                )
            cambios["categoria_id"] = {
                "anterior": str(activo.categoria_id),
                "nuevo": str(data.categoria_id),
            }
            activo.categoria_id = data.categoria_id

        if data.epc is not None:
            normalized = data.epc.strip().upper() if data.epc else ""
            current_epcs = {
                e.epc.strip().upper()
                for e in self.etiqueta_repository.list(activo_id=activo.id)
            }
            legacy = (activo.epc or "").strip().upper()
            if legacy:
                current_epcs.add(legacy)
            if normalized and normalized not in current_epcs:
                owner = self.repository.get_by_epc(normalized)
                if owner is not None and owner.id != activo.id:
                    if owner.activo:
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail="Ya existe un activo con ese EPC",
                        )
                    self._purge_ghost_activo(owner)
                self._attach_etiqueta_epc(activo, normalized)
                cambios["epc"] = {
                    "anterior": next(iter(current_epcs), None),
                    "nuevo": normalized,
                }
            elif not normalized:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "No se puede borrar el EPC del artículo por este endpoint. "
                        "Gestioná unidades RFID desde Etiquetas."
                    ),
                )

        if data.datos_tecnicos is not None and data.datos_tecnicos != activo.datos_tecnicos:
            cambios["datos_tecnicos"] = {
                "anterior": activo.datos_tecnicos,
                "nuevo": data.datos_tecnicos,
            }
            activo.datos_tecnicos = data.datos_tecnicos

        if data.activo is not None and data.activo != activo.activo:
            cambios["activo"] = {"anterior": activo.activo, "nuevo": data.activo}
            activo.activo = data.activo

        if data.serializado is not None and data.serializado != activo.serializado:
            cambios["serializado"] = {
                "anterior": activo.serializado,
                "nuevo": data.serializado,
            }
            activo.serializado = data.serializado

        updated = self.repository.update(activo)

        if cambios:
            self.historial.registrar(
                activo_id=updated.id,
                accion=HistorialService.ACCION_ACTUALIZACION,
                usuario=user,
                cambios=cambios,
            )

        return self._to_response(updated)

    def delete_activo(self, activo_id: uuid.UUID, _user: Usuario) -> None:
        from sqlalchemy import select

        from app.modules.transfers.models import DetalleTransferencia

        activo = self.get_activo(activo_id)
        en_transferencia = self.repository.db.scalars(
            select(DetalleTransferencia.id)
            .where(DetalleTransferencia.activo_id == activo_id)
            .limit(1)
        ).first()
        if en_transferencia is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "No se puede eliminar: el artículo figura en transferencias. "
                    "Cancelá esas transferencias antes de eliminarlo."
                ),
            )
        # Hard delete: libera numero_patrimonial/EPC; cascada en historial/fotos/etiquetas.
        # Inventarios quedan con activo_id NULL (ON DELETE SET NULL).
        self.repository.delete(activo)

    def _purge_ghost_activo(self, activo: Activo) -> None:
        """Elimina un activo inactivo residual (baja lógica antigua) para liberar únicos."""
        from sqlalchemy import delete

        from app.modules.transfers.models import DetalleTransferencia

        self.repository.db.execute(
            delete(DetalleTransferencia).where(DetalleTransferencia.activo_id == activo.id)
        )
        self.repository.delete(activo)

    def get_historial(self, activo_id: uuid.UUID) -> list:
        self.get_activo(activo_id)
        return self.historial.list_by_activo(activo_id)
