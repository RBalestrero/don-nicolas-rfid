import enum
import logging
import re
import socket

from app.integrations.zebra.runtime import get_printer_config

logger = logging.getLogger(__name__)

_MEDIA = 0x1
_RIBBON = 0x2
_HEAD = 0x4
_CUTTER = 0x8


class ZebraPrinterError(Exception):
    pass


class PrinterProbeStatus(str, enum.Enum):
    READY = "ready"
    PAPER_OUT = "paper_out"
    RIBBON_OUT = "ribbon_out"
    HEAD_OPEN = "head_open"
    CUTTER_FAULT = "cutter_fault"
    ERROR = "error"
    OFFLINE = "offline"
    SIMULATED = "simulated"
    UNKNOWN = "unknown"


STATUS_LABELS_ES: dict[PrinterProbeStatus, str] = {
    PrinterProbeStatus.READY: "Lista para imprimir",
    PrinterProbeStatus.PAPER_OUT: "Sin papel / media",
    PrinterProbeStatus.RIBBON_OUT: "Sin ribbon",
    PrinterProbeStatus.HEAD_OPEN: "Cabezal abierto",
    PrinterProbeStatus.CUTTER_FAULT: "Falla de cutter",
    PrinterProbeStatus.ERROR: "Error de impresora",
    PrinterProbeStatus.OFFLINE: "Sin conexión (offline)",
    PrinterProbeStatus.SIMULATED: "Modo simulación (sin consulta real)",
    PrinterProbeStatus.UNKNOWN: "Estado desconocido",
}


class ZebraPrinterClient:
    def send(self, zpl: str) -> bool:
        cfg = get_printer_config()
        if cfg.simulate:
            logger.info("Modo simulación — ZPL no enviado a impresora")
            return False

        try:
            with socket.create_connection(
                (cfg.host, cfg.port),
                timeout=cfg.timeout,
            ) as sock:
                sock.sendall(zpl.encode("utf-8"))
            return True
        except OSError as exc:
            raise ZebraPrinterError(
                f"No se pudo conectar con la impresora {cfg.host}:{cfg.port}"
            ) from exc

    def probe_status(
        self,
        *,
        host: str | None = None,
        port: int | None = None,
        timeout: float | None = None,
        simulate: bool | None = None,
    ) -> tuple[PrinterProbeStatus, str, str | None]:
        """Consulta estado vía ~HQES (ZPL raw TCP 9100).

        Returns: (status, label_es, raw_snippet_or_None)
        """
        cfg = get_printer_config()
        use_simulate = cfg.simulate if simulate is None else simulate
        use_host = host or cfg.host
        use_port = port if port is not None else cfg.port
        use_timeout = float(timeout if timeout is not None else cfg.timeout)

        if use_simulate:
            return (
                PrinterProbeStatus.SIMULATED,
                STATUS_LABELS_ES[PrinterProbeStatus.SIMULATED],
                None,
            )

        try:
            with socket.create_connection((use_host, use_port), timeout=use_timeout) as sock:
                sock.settimeout(use_timeout)
                sock.sendall(b"~HQES\r\n")
                chunks: list[bytes] = []
                while True:
                    try:
                        data = sock.recv(4096)
                    except socket.timeout:
                        break
                    if not data:
                        break
                    chunks.append(data)
                    joined = b"".join(chunks)
                    if b"WARNINGS:" in joined:
                        break
        except OSError as exc:
            logger.info("Probe impresora offline %s:%s — %s", use_host, use_port, exc)
            return (
                PrinterProbeStatus.OFFLINE,
                STATUS_LABELS_ES[PrinterProbeStatus.OFFLINE],
                str(exc),
            )

        text = b"".join(chunks).decode("ascii", errors="replace")
        status = self._parse_hqes(text)
        return status, STATUS_LABELS_ES[status], text.strip()[:500] or None

    @staticmethod
    def _parse_hqes(text: str) -> PrinterProbeStatus:
        m = re.search(
            r"ERRORS:\s*(\d)\s+([0-9A-Fa-f]+)\s+([0-9A-Fa-f]+)",
            text,
        )
        if not m:
            return PrinterProbeStatus.UNKNOWN

        err_flag, g1 = m.group(1), m.group(3)
        if err_flag == "0":
            return PrinterProbeStatus.READY

        nibble1 = int(g1[-1], 16)
        if nibble1 & _MEDIA:
            return PrinterProbeStatus.PAPER_OUT
        if nibble1 & _HEAD:
            return PrinterProbeStatus.HEAD_OPEN
        if nibble1 & _RIBBON:
            return PrinterProbeStatus.RIBBON_OUT
        if nibble1 & _CUTTER:
            return PrinterProbeStatus.CUTTER_FAULT
        return PrinterProbeStatus.ERROR
