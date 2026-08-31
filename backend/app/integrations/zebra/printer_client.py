import logging
import socket

from app.config import get_settings

logger = logging.getLogger(__name__)


class ZebraPrinterError(Exception):
    pass


class ZebraPrinterClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    def send(self, zpl: str) -> bool:
        if self.settings.zebra_printer_simulate:
            logger.info("Modo simulación — ZPL no enviado a impresora")
            return False

        try:
            with socket.create_connection(
                (self.settings.zebra_printer_host, self.settings.zebra_printer_port),
                timeout=self.settings.zebra_printer_timeout,
            ) as sock:
                sock.sendall(zpl.encode("utf-8"))
            return True
        except OSError as exc:
            raise ZebraPrinterError(
                f"No se pudo conectar con la impresora "
                f"{self.settings.zebra_printer_host}:{self.settings.zebra_printer_port}"
            ) from exc
