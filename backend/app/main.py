from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from app.config import get_settings, validate_security_settings
from app.core.security_middleware import (
    RateLimitMiddleware,
    RequestSizeLimitMiddleware,
    SecurityHeadersMiddleware,
)
from app.database import check_database_connection
from app.modules.assets.router import router as assets_router
from app.modules.auth.router import router as auth_router
from app.modules.auth.users_router import router as users_router
from app.modules.devices.router import router as devices_router
from app.modules.inventory.router import router as inventory_router
from app.modules.personas.router import router as personas_router
from app.modules.reports.router import router as reports_router
from app.modules.settings.router import router as settings_router
from app.modules.transfers.router import router as transfers_router
from app.modules.warehouses.router import router as warehouses_router

settings = get_settings()
validate_security_settings(settings)

_docs = "/api/docs" if settings.docs_enabled else None
_redoc = "/api/redoc" if settings.docs_enabled else None
_openapi = "/api/openapi.json" if settings.docs_enabled else None

app = FastAPI(
    title="Don Nicolás RFID API",
    description="Sistema de gestión de activos, inventario y stock distribuido",
    version="0.1.0",
    docs_url=_docs,
    redoc_url=_redoc,
    openapi_url=_openapi,
)

# Orden: últimos agregados corren primero en request.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(assets_router, prefix="/api/v1")
app.include_router(warehouses_router, prefix="/api/v1")
app.include_router(inventory_router, prefix="/api/v1")
app.include_router(transfers_router, prefix="/api/v1")
app.include_router(personas_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1")
app.include_router(devices_router, prefix="/api/v1")


@app.exception_handler(OperationalError)
async def handle_db_operational_error(_request: Request, exc: OperationalError) -> JSONResponse:
    import logging

    logging.getLogger("uvicorn.error").error("DB operational error: %s", exc)
    return JSONResponse(
        status_code=503,
        content={
            "code": "DB_CONNECTION_FAILED",
            "detail": (
                "No se pudo conectar a PostgreSQL. "
                "Levantá el contenedor con: cd infra && docker compose up -d postgres."
            ),
        },
    )


@app.exception_handler(SQLAlchemyError)
async def handle_sqlalchemy_error(_request: Request, exc: SQLAlchemyError) -> JSONResponse:
    import logging

    logging.getLogger("uvicorn.error").error("DB error: %s", exc)
    return JSONResponse(
        status_code=503,
        content={
            "code": "DB_ERROR",
            "detail": "Error de base de datos durante la operación.",
        },
    )


@app.on_event("startup")
def log_registered_routes() -> None:
    import logging

    validate_security_settings(get_settings())
    try:
        from app.database import SessionLocal
        from app.modules.settings.service import load_printer_config

        db = SessionLocal()
        try:
            cfg = load_printer_config(db)
            logging.getLogger("uvicorn.error").info(
                "Impresora Zebra: %s:%s (simulate=%s, fuente=%s)",
                cfg.host,
                cfg.port,
                cfg.simulate,
                cfg.fuente,
            )
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 — no bloquear arranque
        logging.getLogger("uvicorn.error").warning(
            "No se pudo cargar config de impresora: %s", exc
        )

    if not settings.docs_enabled:
        logging.getLogger("uvicorn.error").info("OpenAPI docs deshabilitadas (APP_ENV=%s)", settings.app_env)
        return

    paths = sorted(app.openapi()["paths"].keys())
    logging.getLogger("uvicorn.error").info(
        "Don Nicolás API — %d endpoints: %s",
        len(paths),
        ", ".join(paths),
    )


@app.get("/api/v1/health", tags=["Sistema"])
def health_check() -> dict:
    db_ok = check_database_connection()
    return {
        "status": "ok" if db_ok else "degraded",
        "service": "don-nicolas-rfid-api",
        "version": "0.1.0",
        "database": "connected" if db_ok else "disconnected",
        "code": "OK" if db_ok else "DB_DISCONNECTED",
        "detail": (
            "API y base de datos operativas"
            if db_ok
            else "API arriba pero PostgreSQL no responde. Ejecutá: cd infra && docker compose up -d postgres"
        ),
    }
