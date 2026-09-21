from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.modules.auth.models import Usuario
from app.modules.devices.models import DispositivoMovil
from app.modules.devices.schemas import (
    DispositivoHeartbeatRequest,
    DispositivoLogoutRequest,
    DispositivoMovilItem,
    DispositivoRegistroRequest,
)


class DevicesService:
    def __init__(self, db: Session):
        self.db = db

    def registrar(self, data: DispositivoRegistroRequest, user: Usuario) -> DispositivoMovilItem:
        now = datetime.now(UTC)
        device = self.db.scalars(
            select(DispositivoMovil).where(DispositivoMovil.device_key == data.device_key)
        ).first()
        if device is None:
            device = DispositivoMovil(
                device_key=data.device_key,
                modelo=data.modelo.strip(),
                fabricante=_clean(data.fabricante),
                numero_serie=_clean(data.numero_serie),
                app_version=_clean(data.app_version),
                android_version=_clean(data.android_version),
                usuario_id=user.id,
                ultimo_visto_en=now,
                registrado_en=now,
                sesion_activa=True,
            )
            self.db.add(device)
        else:
            device.modelo = data.modelo.strip()
            device.fabricante = _clean(data.fabricante)
            device.numero_serie = _clean(data.numero_serie) or device.numero_serie
            device.app_version = _clean(data.app_version)
            device.android_version = _clean(data.android_version)
            device.usuario_id = user.id
            device.ultimo_visto_en = now
            device.sesion_activa = True
        self.db.commit()
        self.db.refresh(device)
        return self._to_item(device)

    def heartbeat(self, data: DispositivoHeartbeatRequest, user: Usuario) -> DispositivoMovilItem:
        device = self.db.scalars(
            select(DispositivoMovil).where(DispositivoMovil.device_key == data.device_key)
        ).first()
        if device is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": "DEVICE_NOT_REGISTERED",
                    "message": "Dispositivo no registrado. Ejecutá el registro tras el login.",
                },
            )
        if device.usuario_id is not None and device.usuario_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "DEVICE_OWNED_BY_OTHER",
                    "message": (
                        "Este dispositivo tiene sesión de otro usuario. "
                        "Volvé a registrar tras un login en la APK."
                    ),
                },
            )
        now = datetime.now(UTC)
        device.ultimo_visto_en = now
        device.sesion_activa = True
        device.usuario_id = user.id
        self.db.commit()
        self.db.refresh(device)
        return self._to_item(device)

    def logout(self, data: DispositivoLogoutRequest, user: Usuario) -> DispositivoMovilItem | None:
        device = self.db.scalars(
            select(DispositivoMovil).where(DispositivoMovil.device_key == data.device_key)
        ).first()
        if device is None:
            return None
        if device.usuario_id is not None and device.usuario_id != user.id:
            # Otro usuario tomó el dispositivo; no tocar su sesión.
            return self._to_item(device)
        device.sesion_activa = False
        self.db.commit()
        self.db.refresh(device)
        return self._to_item(device)

    def list_for_dashboard(self, *, limit: int = 20) -> list[DispositivoMovilItem]:
        limit = min(max(limit, 1), 50)
        settings = get_settings()
        cutoff_history = datetime.now(UTC) - timedelta(days=30)
        rows = list(
            self.db.scalars(
                select(DispositivoMovil)
                .options(selectinload(DispositivoMovil.usuario))
                .where(
                    or_(
                        DispositivoMovil.sesion_activa.is_(True),
                        DispositivoMovil.ultimo_visto_en >= cutoff_history,
                    )
                )
                .order_by(
                    DispositivoMovil.sesion_activa.desc(),
                    DispositivoMovil.ultimo_visto_en.desc(),
                )
                .limit(limit)
            ).all()
        )
        timeout = timedelta(seconds=settings.device_online_timeout_seconds)
        now = datetime.now(UTC)
        items = [self._to_item(row, now=now, timeout=timeout) for row in rows]
        rank = {"en_linea": 0, "inactivo": 1, "sesion_cerrada": 2}
        items.sort(
            key=lambda d: (rank.get(d.estado, 9), -d.ultimo_visto_en.timestamp())
        )
        return items

    def _to_item(
        self,
        device: DispositivoMovil,
        *,
        now: datetime | None = None,
        timeout: timedelta | None = None,
    ) -> DispositivoMovilItem:
        settings = get_settings()
        now = now or datetime.now(UTC)
        timeout = timeout or timedelta(seconds=settings.device_online_timeout_seconds)
        visto = device.ultimo_visto_en
        if visto.tzinfo is None:
            visto = visto.replace(tzinfo=UTC)
        en_linea = bool(device.sesion_activa and (now - visto) <= timeout)
        if en_linea:
            estado = "en_linea"
        elif device.sesion_activa:
            estado = "inactivo"
        else:
            estado = "sesion_cerrada"
        usuario = device.usuario
        return DispositivoMovilItem(
            id=device.id,
            device_key=device.device_key,
            modelo=device.modelo,
            fabricante=device.fabricante,
            numero_serie=device.numero_serie,
            app_version=device.app_version,
            android_version=device.android_version,
            usuario_id=device.usuario_id,
            usuario_nombre=usuario.nombre if usuario else None,
            usuario_email=usuario.email if usuario else None,
            ultimo_visto_en=device.ultimo_visto_en,
            registrado_en=device.registrado_en,
            sesion_activa=device.sesion_activa,
            en_linea=en_linea,
            estado=estado,
        )


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None
