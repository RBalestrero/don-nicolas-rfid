from dataclasses import dataclass


@dataclass
class EtiquetaData:
    numero_patrimonial: str
    descripcion: str
    epc: str
    categoria: str = ""
    serie_fisica: str | None = None


def _escape_zpl(text: str) -> str:
    return text.replace("^", "").replace("~", "").replace("\\", "")


def generar_zpl_etiqueta(data: EtiquetaData, copias: int = 1) -> str:
    """Genera ZPL para etiqueta RFID con QR, código de barras y codificación EPC."""
    descripcion = _escape_zpl(data.descripcion)[:40]
    patrimonial = _escape_zpl(data.numero_patrimonial)
    categoria = _escape_zpl(data.categoria)[:30]
    epc = data.epc.upper()
    serie_line = ""
    if data.serie_fisica:
        serie = _escape_zpl(data.serie_fisica)[:40]
        serie_line = f"^FO40,125^A0N,18,18^FDS/N: {serie}^FS\n"

    return f"""^XA
^PW800
^LL400
^RS8
^RFW,H,2,12,1^FD{epc}^FS
^FO40,30^A0N,28,28^FD{descripcion}^FS
^FO40,65^A0N,22,22^FDPat: {patrimonial}^FS
^FO40,95^A0N,18,18^FD{categoria}^FS
{serie_line}^FO500,30^BQN,2,5^FDQA,{patrimonial}^FS
^FO40,200^BCN,80,Y,N,N^FD{patrimonial}^FS
^FO40,320^A0N,16,16^FDEPC: {epc}^FS
^PQ{copias}
^XZ
"""


def generar_zpl_lote(etiquetas: list[EtiquetaData]) -> str:
    """Un trabajo ZPL por etiqueta (cada una con EPC distinto)."""
    return "".join(generar_zpl_etiqueta(e, copias=1) for e in etiquetas)
