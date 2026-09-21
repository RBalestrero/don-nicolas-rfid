"""Puente: config de impresora usable sin Session explícita (lee DB por request)."""

from app.modules.settings.service import get_printer_config, load_printer_config

__all__ = ["get_printer_config", "load_printer_config"]
