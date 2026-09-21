"""Configuración runtime de la impresora Zebra (override sobre .env)."""

from __future__ import annotations

import ipaddress
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.modules.settings.models import AppSetting

CLAVE_ZEBRA = "zebra_printer"
logger = logging.getLogger(__name__)

_BLOCKED_HOSTS = {
    "localhost",
    "metadata.google.internal",
    "metadata",
    "metadata.azure.com",
}


@dataclass(frozen=True)
class PrinterConfig:
    host: str
    port: int
    simulate: bool
    timeout: int
    actualizado_en: datetime | None = None
    fuente: str = "env"


def _from_env() -> PrinterConfig:
    s = get_settings()
    return PrinterConfig(
        host=s.zebra_printer_host,
        port=s.zebra_printer_port,
        simulate=s.zebra_printer_simulate,
        timeout=s.zebra_printer_timeout,
        fuente="env",
    )


def validate_printer_host(host: str) -> str:
    """Evita apuntar la impresora a metadata cloud / hosts claramente abusivos."""
    cleaned = (host or "").strip()
    if not cleaned or len(cleaned) > 255:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Host de impresora inválido",
        )
    if cleaned.lower() in _BLOCKED_HOSTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Host de impresora no permitido",
        )
    # Solo hostname / IPv4 / IPv6 literal (sin esquema ni path)
    if re.search(r"[\s/\\?#]", cleaned) or "://" in cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Host de impresora inválido",
        )
    try:
        ip = ipaddress.ip_address(cleaned.strip("[]"))
    except ValueError:
        return cleaned
    if ip.is_link_local or ip.is_multicast or ip.is_unspecified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Host de impresora no permitido",
        )
    if str(ip) == "169.254.169.254":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Host de impresora no permitido",
        )
    return cleaned


def _parse_row(valor: dict, base: PrinterConfig, actualizado_en: datetime | None) -> PrinterConfig:
    try:
        port = int(valor["port"]) if valor.get("port") is not None else base.port
        timeout = int(valor["timeout"]) if valor.get("timeout") is not None else base.timeout
    except (TypeError, ValueError) as exc:
        logger.warning("Config impresora corrupta en DB; usando .env: %s", exc)
        return base
    if not (1 <= port <= 65535) or timeout < 1:
        logger.warning("Config impresora con port/timeout inválidos; usando .env")
        return base
    host_raw = valor.get("host")
    host = str(host_raw).strip() if host_raw else base.host
    return PrinterConfig(
        host=host or base.host,
        port=port,
        simulate=bool(valor.get("simulate", base.simulate)),
        timeout=timeout,
        actualizado_en=actualizado_en,
        fuente="database",
    )


def load_printer_config(db: Session | None = None) -> PrinterConfig:
    """Lee config de impresora: DB (app_settings) con fallback a .env. Sin cache de proceso."""
    if db is None:
        from app.database import SessionLocal

        session = SessionLocal()
        try:
            return load_printer_config(session)
        finally:
            session.close()

    row = db.get(AppSetting, CLAVE_ZEBRA)
    if not row or not isinstance(row.valor, dict):
        return _from_env()
    return _parse_row(row.valor, _from_env(), row.actualizado_en)


def get_printer_config() -> PrinterConfig:
    """Siempre lee desde DB (o .env). Seguro con múltiples workers."""
    return load_printer_config(None)


def invalidate_printer_cache() -> None:
    """No-op: la config ya no se cachea en memoria de proceso."""
    return None


def save_printer_config(
    db: Session,
    *,
    host: str | None = None,
    port: int | None = None,
    simulate: bool | None = None,
    timeout: int | None = None,
) -> PrinterConfig:
    current = load_printer_config(db)
    resolved_host = validate_printer_host(host) if host is not None else current.host
    if port is not None and not (1 <= port <= 65535):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Puerto de impresora inválido",
        )
    if timeout is not None and timeout < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Timeout de impresora inválido",
        )
    new_valor = {
        "host": resolved_host,
        "port": port if port is not None else current.port,
        "simulate": simulate if simulate is not None else current.simulate,
        "timeout": timeout if timeout is not None else current.timeout,
    }
    row = db.get(AppSetting, CLAVE_ZEBRA)
    now = datetime.now(timezone.utc)
    if row is None:
        row = AppSetting(clave=CLAVE_ZEBRA, valor=new_valor, actualizado_en=now)
        db.add(row)
    else:
        row.valor = new_valor
        row.actualizado_en = now
    db.commit()
    db.refresh(row)
    return PrinterConfig(
        host=new_valor["host"],
        port=int(new_valor["port"]),
        simulate=bool(new_valor["simulate"]),
        timeout=int(new_valor["timeout"]),
        actualizado_en=row.actualizado_en,
        fuente="database",
    )
