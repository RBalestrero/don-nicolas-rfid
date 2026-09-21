"""Middlewares de seguridad HTTP."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import get_settings
from app.core.rate_limit import api_rate_limiter, login_rate_limiter


def client_ip(request: Request, *, trust_forwarded: bool | None = None) -> str:
    """IP del cliente. Solo usa X-Forwarded-For si trust_x_forwarded_for=True."""
    settings = get_settings()
    use_xff = settings.trust_x_forwarded_for if trust_forwarded is None else trust_forwarded
    if use_xff:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # Primer hop = cliente original cuando el proxy confiable reescribe la cadena.
            return forwarded.split(",")[0].strip() or "unknown"
    if request.client:
        return request.client.host
    return "unknown"


def _client_ip(request: Request) -> str:
    return client_ip(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Cache-Control", "no-store")
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return await call_next(request)

        path = request.url.path
        method = request.method.upper()
        ip = _client_ip(request)

        if method == "POST" and path.rstrip("/").endswith("/auth/login"):
            allowed, retry = login_rate_limiter.hit(
                f"login:{ip}",
                settings.login_rate_limit_per_minute,
                60.0,
            )
            if not allowed:
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": {
                            "code": "AUTH_RATE_LIMITED",
                            "message": (
                                "Demasiados intentos de login. "
                                f"Reintentá en {retry}s."
                            ),
                        }
                    },
                    headers={"Retry-After": str(retry)},
                )
        elif path.startswith("/api/"):
            allowed, retry = api_rate_limiter.hit(
                f"api:{ip}",
                settings.api_rate_limit_per_minute,
                60.0,
            )
            if not allowed:
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": {
                            "code": "API_RATE_LIMITED",
                            "message": f"Límite de requests excedido. Reintentá en {retry}s.",
                        }
                    },
                    headers={"Retry-After": str(retry)},
                )

        return await call_next(request)


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()
        max_bytes = settings.max_request_body_mb * 1024 * 1024
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > max_bytes:
                    return JSONResponse(
                        status_code=413,
                        content={
                            "detail": {
                                "code": "PAYLOAD_TOO_LARGE",
                                "message": (
                                    f"El cuerpo de la solicitud supera {settings.max_request_body_mb} MB."
                                ),
                            }
                        },
                    )
            except ValueError:
                pass
        return await call_next(request)
