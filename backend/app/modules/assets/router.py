import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.rbac import require_assets_write, require_assignment_write
from app.dependencies import get_current_user
from app.modules.assets.fotografias_service import FotografiaService
from app.modules.assets.impresion_service import ImpresionService
from app.modules.assets.observaciones_service import ObservacionService
from app.modules.assets.schemas import (
    ActivoCreate,
    ActivoLookupEpcsRequest,
    ActivoLookupEpcsResponse,
    ActivoLookupResponse,
    ActivoLookupSerieResponse,
    ActivoResponse,
    ActivoUpdate,
    CategoriaCreate,
    CategoriaResponse,
    CategoriaUpdate,
    EpcDecodedInfo,
    EtiquetaCodificacionRequest,
    EtiquetaCodificacionResponse,
    EtiquetaImpresionRequest,
    EtiquetaImpresionResponse,
    EtiquetaLoteRequest,
    EtiquetaLoteResponse,
    EtiquetaResponse,
    FotografiaResponse,
    HistorialResponse,
    ObservacionCreate,
    ObservacionResponse,
)
from app.modules.assets.service import ActivoService, CategoriaService
from app.modules.auth.models import Usuario
from app.modules.warehouses.asignacion_service import AsignacionService
from app.modules.warehouses.schemas import (
    ActivoUbicacionStockItem,
    AsignacionUbicacionRequest,
    UbicacionAsignadaResponse,
)
from app.modules.warehouses.stock_service import StockService

router = APIRouter(tags=["Activos"])


@router.get("/categorias", response_model=list[CategoriaResponse])
def list_categorias(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = CategoriaService(db)
    return service.list_categorias(include_inactive=include_inactive)


@router.post("/categorias", response_model=CategoriaResponse, status_code=status.HTTP_201_CREATED)
def create_categoria(
    data: CategoriaCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_assets_write),
):
    service = CategoriaService(db)
    return service.create_categoria(data)


@router.get("/categorias/{categoria_id}", response_model=CategoriaResponse)
def get_categoria(
    categoria_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = CategoriaService(db)
    return service.get_categoria(categoria_id)


@router.put("/categorias/{categoria_id}", response_model=CategoriaResponse)
def update_categoria(
    categoria_id: uuid.UUID,
    data: CategoriaUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_assets_write),
):
    service = CategoriaService(db)
    return service.update_categoria(categoria_id, data)


@router.delete("/categorias/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_categoria(
    categoria_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_assets_write),
):
    service = CategoriaService(db)
    service.delete_categoria(categoria_id)


@router.get("/activos", response_model=list[ActivoResponse])
def list_activos(
    categoria_id: uuid.UUID | None = None,
    search: str | None = Query(None, min_length=1),
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = ActivoService(db)
    return service.list_activos(
        categoria_id=categoria_id,
        search=search,
        include_inactive=include_inactive,
    )


@router.post("/activos", response_model=ActivoResponse, status_code=status.HTTP_201_CREATED)
def create_activo(
    data: ActivoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assets_write),
):
    service = ActivoService(db)
    return service.create_activo(data, current_user)


@router.get("/activos/by-epc/{epc}", response_model=ActivoLookupResponse)
def lookup_activo_by_epc(
    epc: str,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Búsqueda de activo por EPC leído con RFID (Fase 3.5)."""
    return ActivoService(db).lookup_by_epc(epc)


@router.get(
    "/activos/by-serie-fisica/{serie}",
    response_model=ActivoLookupSerieResponse,
)
def lookup_activo_by_serie_fisica(
    serie: str,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Búsqueda de unidad/artículo por número de serie de fábrica."""
    return ActivoService(db).lookup_by_serie_fisica(serie)


@router.post("/activos/lookup-epcs", response_model=ActivoLookupEpcsResponse)
def lookup_activos_by_epcs(
    data: ActivoLookupEpcsRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Resuelve un lote de EPCs a artículos registrados + ubicación (escaneo de zona)."""
    return ActivoService(db).lookup_by_epcs(data.epcs)


@router.get("/activos/{activo_id}", response_model=ActivoResponse)
def get_activo(
    activo_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = ActivoService(db)
    return service.get_activo_response(activo_id)


@router.put("/activos/{activo_id}", response_model=ActivoResponse)
def update_activo(
    activo_id: uuid.UUID,
    data: ActivoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assets_write),
):
    service = ActivoService(db)
    return service.update_activo(activo_id, data, current_user)


@router.delete("/activos/{activo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activo(
    activo_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assets_write),
):
    service = ActivoService(db)
    service.delete_activo(activo_id, current_user)


@router.post(
    "/activos/{activo_id}/asignar-ubicacion",
    response_model=UbicacionAsignadaResponse,
)
def asignar_ubicacion_activo(
    activo_id: uuid.UUID,
    data: AsignacionUbicacionRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assignment_write),
):
    service = AsignacionService(db)
    return service.asignar_ubicacion(activo_id, data, current_user)


@router.get("/activos/{activo_id}/ubicacion", response_model=UbicacionAsignadaResponse)
def get_ubicacion_activo(
    activo_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = AsignacionService(db)
    return service.get_ubicacion_activo(activo_id)


@router.get(
    "/activos/{activo_id}/ubicaciones-stock",
    response_model=list[ActivoUbicacionStockItem],
)
def list_ubicaciones_stock_activo(
    activo_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Ubicaciones exactas donde el artículo tiene unidades (para inventario por SKU)."""
    return StockService(db).list_ubicaciones_con_stock(activo_id)


@router.delete("/activos/{activo_id}/ubicacion", status_code=status.HTTP_204_NO_CONTENT)
def desasignar_ubicacion_activo(
    activo_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assignment_write),
):
    service = AsignacionService(db)
    service.desasignar_ubicacion(activo_id, current_user)


@router.get("/activos/{activo_id}/historial", response_model=list[HistorialResponse])
def get_historial_activo(
    activo_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = ActivoService(db)
    registros = service.get_historial(activo_id)
    return [
        HistorialResponse(
            id=r.id,
            activo_id=r.activo_id,
            usuario_id=r.usuario_id,
            usuario_nombre=getattr(r, "_usuario_nombre", None),
            accion=r.accion,
            cambios=r.cambios,
            creado_en=r.creado_en,
        )
        for r in registros
    ]


def _observacion_response(obs) -> ObservacionResponse:
    return ObservacionResponse(
        id=obs.id,
        activo_id=obs.activo_id,
        usuario_id=obs.usuario_id,
        usuario_nombre=getattr(obs, "_usuario_nombre", None),
        texto=obs.texto,
        creado_en=obs.creado_en,
    )


@router.get(
    "/activos/{activo_id}/observaciones",
    response_model=list[ObservacionResponse],
)
def list_observaciones_activo(
    activo_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    observaciones = ObservacionService(db).list_by_activo(activo_id)
    return [_observacion_response(o) for o in observaciones]


@router.post(
    "/activos/{activo_id}/observaciones",
    response_model=ObservacionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_observacion_activo(
    activo_id: uuid.UUID,
    data: ObservacionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assets_write),
):
    obs = ObservacionService(db).create(activo_id, data.texto, current_user)
    return _observacion_response(obs)


@router.delete(
    "/activos/{activo_id}/observaciones/{observacion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_observacion_activo(
    activo_id: uuid.UUID,
    observacion_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_assets_write),
):
    ObservacionService(db).delete(activo_id, observacion_id)


@router.post(
    "/activos/{activo_id}/codificar-etiqueta",
    response_model=EtiquetaCodificacionResponse,
)
def codificar_etiqueta(
    activo_id: uuid.UUID,
    data: EtiquetaCodificacionRequest | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assets_write),
):
    """Crea una o más unidades RFID (EPC) para el artículo, sin imprimir."""
    service = ImpresionService(db)
    cantidad = data.cantidad if data else 1
    regenerar = data.regenerar if data else False
    return service.codificar_etiqueta(
        activo_id, current_user, regenerar=regenerar, cantidad=cantidad
    )


@router.post(
    "/activos/{activo_id}/etiquetas",
    response_model=EtiquetaLoteResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_etiquetas(
    activo_id: uuid.UUID,
    data: EtiquetaLoteRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assets_write),
):
    """Alta de N etiquetas (unidades) para un artículo/SKU, sin imprimir."""
    if data.modo == "reposicion":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reposición solo aplica a impresión",
        )
    return ImpresionService(db).crear_lote(
        activo_id,
        current_user,
        data.cantidad,
        imprimir=False,
        modo="nueva",
        series_fisicas=data.series_fisicas,
    )


@router.post(
    "/activos/{activo_id}/imprimir-etiquetas",
    response_model=EtiquetaLoteResponse,
)
def imprimir_etiquetas_lote(
    activo_id: uuid.UUID,
    data: EtiquetaLoteRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assets_write),
):
    """Genera N EPCs (nueva) o reimprime existentes (reposicion)."""
    return ImpresionService(db).crear_lote(
        activo_id,
        current_user,
        data.cantidad,
        imprimir=True,
        modo=data.modo,
        series_fisicas=data.series_fisicas,
    )


@router.delete(
    "/activos/{activo_id}/etiquetas/{etiqueta_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def dar_baja_etiqueta(
    activo_id: uuid.UUID,
    etiqueta_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assets_write),
):
    """Da de baja una etiqueta (deja de contar en stock; no borra el EPC)."""
    ImpresionService(db).dar_baja_etiqueta(activo_id, etiqueta_id, current_user)


@router.get("/etiquetas", response_model=list[EtiquetaResponse])
def list_etiquetas(
    activo_id: uuid.UUID | None = None,
    search: str | None = Query(None, min_length=1),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return ImpresionService(db).list_etiquetas(activo_id=activo_id, search=search)


@router.get("/epc/decode", response_model=EpcDecodedInfo)
def decode_epc_endpoint(
    epc: str,
    _current_user: Usuario = Depends(get_current_user),
):
    """Decodifica un EPC (esquema D1 → artículo + serial)."""
    from app.integrations.zebra.epc_generator import decode_epc

    decoded = decode_epc(epc)
    return EpcDecodedInfo(
        epc=decoded.epc,
        scheme=decoded.scheme,
        articulo_code=decoded.articulo_code,
        articulo_sugerido=decoded.articulo_sugerido,
        serial=decoded.serial,
        serial_hex=decoded.serial_hex,
        system_suffix=decoded.system_suffix,
        del_sistema=decoded.del_sistema,
        valido=decoded.valido,
        mensaje=decoded.mensaje,
    )


@router.post(
    "/activos/{activo_id}/imprimir-etiqueta",
    response_model=EtiquetaImpresionResponse,
)
def imprimir_etiqueta(
    activo_id: uuid.UUID,
    data: EtiquetaImpresionRequest | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assets_write),
):
    """Compat: imprime N unidades nuevas (copias = cantidad de EPCs distintos)."""
    service = ImpresionService(db)
    copias = data.copias if data else 1
    return service.imprimir_etiqueta(activo_id, current_user, copias=copias)


@router.post(
    "/activos/{activo_id}/fotografias",
    response_model=FotografiaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_fotografia(
    activo_id: uuid.UUID,
    file: UploadFile = File(...),
    es_principal: bool = False,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assets_write),
):
    service = FotografiaService(db)
    return await service.upload(activo_id, file, current_user, es_principal=es_principal)


@router.get("/activos/{activo_id}/fotografias", response_model=list[FotografiaResponse])
def list_fotografias(
    activo_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = FotografiaService(db)
    return service.list_fotografias(activo_id)


@router.get("/fotografias/{foto_id}/archivo")
def get_fotografia_archivo(
    foto_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    service = FotografiaService(db)
    path, mime_type = service.get_file_path(foto_id)
    return FileResponse(path, media_type=mime_type, filename=path.name)


@router.delete("/fotografias/{foto_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fotografia(
    foto_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_assets_write),
):
    service = FotografiaService(db)
    service.delete_fotografia(foto_id, current_user)
