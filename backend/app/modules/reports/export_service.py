import uuid
from datetime import datetime

from fastapi import HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.modules.inventory.service import InventoryService
from app.modules.reports.export_formats import (
    CONTENT_CSV,
    CONTENT_PDF,
    EXPORT_LIMIT,
    csv_response,
    file_response,
    inventario_to_pdf,
    parse_formato,
    rows_to_csv,
    xlsx_response,
)
from app.modules.reports.service import ReportsService
from app.modules.transfers.service import TransferService
from app.modules.warehouses.stock_service import StockService


class ExportService:
    def __init__(self, db: Session):
        self.db = db
        self.reports = ReportsService(db)
        self.stock = StockService(db)
        self.inventory = InventoryService(db)
        self.transfers = TransferService(db)

    def export_movimientos(
        self,
        *,
        formato: str,
        accion: str | None = None,
        activo_id: uuid.UUID | None = None,
        usuario_id: uuid.UUID | None = None,
        desde: datetime | None = None,
        hasta: datetime | None = None,
        search: str | None = None,
    ) -> Response:
        fmt = parse_formato(formato)
        page = self.reports.list_movimientos(
            limit=EXPORT_LIMIT,
            offset=0,
            accion=accion,
            activo_id=activo_id,
            usuario_id=usuario_id,
            desde=desde,
            hasta=hasta,
            search=search,
        )
        if page.total > EXPORT_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Demasiados movimientos ({page.total}). Refiná filtros (máx {EXPORT_LIMIT}).",
            )

        headers = [
            "creado_en",
            "accion",
            "numero_patrimonial",
            "descripcion",
            "usuario",
            "activo_id",
            "cambios",
        ]
        rows = [
            [
                m.creado_en,
                m.accion,
                m.numero_patrimonial,
                m.descripcion,
                m.usuario_nombre,
                str(m.activo_id),
                m.cambios,
            ]
            for m in page.items
        ]
        stamp = datetime.now().strftime("%Y%m%d")
        if fmt == "csv":
            return csv_response(headers, rows, f"movimientos_{stamp}.csv")
        return xlsx_response({"Movimientos": (headers, rows)}, f"movimientos_{stamp}.xlsx")

    def export_stock(self, deposito_id: uuid.UUID, *, formato: str) -> Response:
        fmt = parse_formato(formato)
        stock = self.stock.get_stock_deposito(deposito_id)
        headers = [
            "numero_patrimonial",
            "descripcion",
            "categoria",
            "epc",
            "sector",
            "ubicacion",
            "activo_id",
        ]
        rows = [
            [
                a.numero_patrimonial,
                a.descripcion,
                a.categoria_nombre,
                a.epc,
                a.sector_nombre,
                a.ubicacion_codigo,
                str(a.activo_id),
            ]
            for a in stock.activos
        ]
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in stock.deposito_nombre)
        stamp = datetime.now().strftime("%Y%m%d")
        filename_base = f"stock_{safe_name}_{stamp}"
        if fmt == "csv":
            return csv_response(headers, rows, f"{filename_base}.csv")
        return xlsx_response(
            {
                "Stock": (headers, rows),
                "Resumen": (
                    ["deposito", "total"],
                    [[stock.deposito_nombre, stock.total]],
                ),
            },
            f"{filename_base}.xlsx",
        )

    def export_inventario(self, inventario_id: uuid.UUID, *, formato: str) -> Response:
        fmt = parse_formato(formato, allow_pdf=True)
        reporte = self.inventory.reporte(inventario_id)

        def detalle_rows(items):
            return [
                [
                    d.numero_patrimonial,
                    d.epc,
                    d.descripcion,
                    d.estado,
                    str(d.activo_id) if d.activo_id else "",
                ]
                for d in items
            ]

        headers = ["numero_patrimonial", "epc", "descripcion", "estado", "activo_id"]
        faltantes = detalle_rows(reporte.faltantes)
        sobrantes = detalle_rows(reporte.sobrantes)
        encontrados = detalle_rows(reporte.encontrados)
        stamp = datetime.now().strftime("%Y%m%d")
        base = f"inventario_{str(inventario_id)[:8]}_{stamp}"

        if fmt == "csv":
            rows = (
                [["faltante", *r] for r in faltantes]
                + [["sobrante", *r] for r in sobrantes]
                + [["encontrado", *r] for r in encontrados]
            )
            return csv_response(
                ["tipo", *headers],
                rows,
                f"{base}.csv",
            )

        if fmt == "xlsx":
            return xlsx_response(
                {
                    "Resumen": (
                        [
                            "inventario_id",
                            "estado",
                            "esperado",
                            "encontrado",
                            "faltante",
                            "sobrante",
                            "coincidencia_pct",
                        ],
                        [
                            [
                                str(reporte.inventario_id),
                                reporte.estado,
                                reporte.resumen.total_esperado,
                                reporte.resumen.total_encontrado,
                                reporte.resumen.total_faltante,
                                reporte.resumen.total_sobrante,
                                reporte.coincidencia_pct,
                            ]
                        ],
                    ),
                    "Faltantes": (headers, faltantes),
                    "Sobrantes": (headers, sobrantes),
                    "Encontrados": (headers, encontrados),
                },
                f"{base}.xlsx",
            )

        pdf_bytes = inventario_to_pdf(
            titulo=f"Inventario {str(reporte.inventario_id)[:8]}",
            resumen_lines=[
                f"Estado: {reporte.estado}",
                (
                    f"Esperado {reporte.resumen.total_esperado} · "
                    f"Encontrado {reporte.resumen.total_encontrado} · "
                    f"Faltante {reporte.resumen.total_faltante} · "
                    f"Sobrante {reporte.resumen.total_sobrante}"
                ),
                f"Coincidencia: {reporte.coincidencia_pct}%",
            ],
            secciones={
                "Faltantes": [
                    [d.numero_patrimonial, d.epc, d.descripcion, d.estado]
                    for d in reporte.faltantes
                ],
                "Sobrantes": [
                    [d.numero_patrimonial, d.epc, d.descripcion, d.estado]
                    for d in reporte.sobrantes
                ],
                "Encontrados": [
                    [d.numero_patrimonial, d.epc, d.descripcion, d.estado]
                    for d in reporte.encontrados
                ],
            },
        )
        return file_response(pdf_bytes, filename=f"{base}.pdf", media_type=CONTENT_PDF)

    def export_transferencias(
        self,
        *,
        formato: str,
        estado: str | None = None,
        deposito_origen_id: uuid.UUID | None = None,
        deposito_destino_id: uuid.UUID | None = None,
    ) -> Response:
        fmt = parse_formato(formato)
        items = self.transfers.list_transferencias(
            estado=estado,
            deposito_origen_id=deposito_origen_id,
            deposito_destino_id=deposito_destino_id,
            limit=EXPORT_LIMIT,
        )
        headers = [
            "id",
            "estado",
            "deposito_origen_id",
            "deposito_destino_id",
            "total_activos",
            "confirmados_origen",
            "confirmados_destino",
            "creado_en",
            "enviado_en",
            "completado_en",
        ]
        rows = [
            [
                str(t.id),
                t.estado,
                str(t.deposito_origen_id),
                str(t.deposito_destino_id),
                t.total_activos,
                t.confirmados_origen,
                t.confirmados_destino,
                t.creado_en,
                t.enviado_en,
                t.completado_en,
            ]
            for t in items
        ]
        stamp = datetime.now().strftime("%Y%m%d")
        if fmt == "csv":
            return csv_response(headers, rows, f"transferencias_{stamp}.csv")
        return xlsx_response({"Transferencias": (headers, rows)}, f"transferencias_{stamp}.xlsx")

    def export_transferencia_detalle(self, transferencia_id: uuid.UUID, *, formato: str) -> Response:
        fmt = parse_formato(formato)
        xfer = self.transfers.get(transferencia_id)
        cab_headers = [
            "id",
            "estado",
            "deposito_origen_id",
            "deposito_destino_id",
            "ubicacion_destino_id",
            "notas",
            "creado_en",
            "enviado_en",
            "completado_en",
        ]
        cab_rows = [
            [
                str(xfer.id),
                xfer.estado,
                str(xfer.deposito_origen_id),
                str(xfer.deposito_destino_id),
                str(xfer.ubicacion_destino_id) if xfer.ubicacion_destino_id else "",
                xfer.notas,
                xfer.creado_en,
                xfer.enviado_en,
                xfer.completado_en,
            ]
        ]
        det_headers = [
            "numero_patrimonial",
            "epc",
            "descripcion",
            "confirmado_origen",
            "confirmado_destino",
            "activo_id",
        ]
        det_rows = [
            [
                d.numero_patrimonial,
                d.epc,
                d.descripcion,
                d.confirmado_origen,
                d.confirmado_destino,
                str(d.activo_id),
            ]
            for d in xfer.detalles
        ]
        stamp = datetime.now().strftime("%Y%m%d")
        base = f"transferencia_{str(xfer.id)[:8]}_{stamp}"
        if fmt == "csv":
            # una sola tabla plana con cabecera repetida mínima
            content = rows_to_csv(
                ["seccion", *det_headers],
                [["detalle", *r] for r in det_rows],
            )
            return file_response(content, filename=f"{base}.csv", media_type=CONTENT_CSV)
        return xlsx_response(
            {
                "Cabecera": (cab_headers, cab_rows),
                "Detalle": (det_headers, det_rows),
            },
            f"{base}.xlsx",
        )
