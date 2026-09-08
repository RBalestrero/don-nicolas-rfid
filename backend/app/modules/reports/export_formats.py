import csv
import io
import json
from datetime import datetime
from typing import Any, Sequence

from fastapi import HTTPException, status
from fastapi.responses import Response
from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

EXPORT_LIMIT = 10_000

CONTENT_CSV = "text/csv; charset=utf-8"
CONTENT_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
CONTENT_PDF = "application/pdf"


def parse_formato(formato: str, *, allow_pdf: bool = False) -> str:
    value = (formato or "xlsx").strip().lower()
    allowed = {"csv", "xlsx"}
    if allow_pdf:
        allowed.add("pdf")
    if value not in allowed:
        opts = ", ".join(sorted(allowed))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato inválido. Usá: {opts}",
        )
    return value


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict) or isinstance(value, list):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def rows_to_csv(headers: Sequence[str], rows: Sequence[Sequence[Any]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    for row in rows:
        writer.writerow([_cell(v) for v in row])
    # BOM para Excel en Windows
    return ("\ufeff" + buffer.getvalue()).encode("utf-8")


def rows_to_xlsx(
    sheets: dict[str, tuple[Sequence[str], Sequence[Sequence[Any]]]],
) -> bytes:
    wb = Workbook()
    first = True
    for title, (headers, rows) in sheets.items():
        if first:
            ws = wb.active
            ws.title = title[:31]
            first = False
        else:
            ws = wb.create_sheet(title[:31])
        ws.append(list(headers))
        for row in rows:
            ws.append([_cell(v) for v in row])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def inventario_to_pdf(
    *,
    titulo: str,
    resumen_lines: list[str],
    secciones: dict[str, list[Sequence[Any]]],
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=36, rightMargin=36)
    styles = getSampleStyleSheet()
    story: list[Any] = [
        Paragraph(titulo, styles["Heading1"]),
        Spacer(1, 8),
    ]
    for line in resumen_lines:
        story.append(Paragraph(line, styles["Normal"]))
    story.append(Spacer(1, 12))

    headers = ["Patrimonial", "EPC", "Descripción", "Estado"]
    for nombre, filas in secciones.items():
        story.append(Paragraph(f"{nombre} ({len(filas)})", styles["Heading2"]))
        data = [headers] + [[_cell(c) for c in row] for row in filas]
        if len(data) == 1:
            data.append(["—", "—", "Sin registros", "—"])
        table = Table(data, repeatRows=1, colWidths=[110, 140, 280, 80])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.append(table)
        story.append(Spacer(1, 14))

    doc.build(story)
    return buffer.getvalue()


def file_response(content: bytes, *, filename: str, media_type: str) -> Response:
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def csv_response(headers: Sequence[str], rows: Sequence[Sequence[Any]], filename: str) -> Response:
    return file_response(rows_to_csv(headers, rows), filename=filename, media_type=CONTENT_CSV)


def xlsx_response(
    sheets: dict[str, tuple[Sequence[str], Sequence[Sequence[Any]]]],
    filename: str,
) -> Response:
    return file_response(rows_to_xlsx(sheets), filename=filename, media_type=CONTENT_XLSX)


def pdf_response(content: bytes, filename: str) -> Response:
    return file_response(content, filename=filename, media_type=CONTENT_PDF)
