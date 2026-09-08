from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from app.config import get_settings
from app.core.security_middleware import (
    RateLimitMiddleware,
    RequestSizeLimitMiddleware,
    SecurityHeadersMiddleware,
)
from app.database import check_database_connection
from app.modules.assets.router import router as assets_router
from app.modules.auth.router import router as auth_router
from app.modules.inventory.router import router as inventory_router
from app.modules.reports.router import router as reports_router
from app.modules.transfers.router import router as transfers_router
from app.modules.warehouses.router import router as warehouses_router

settings = get_settings()

app = FastAPI(
    title="Don Nicolás RFID API",
    description="Sistema de gestión de activos, inventario y stock distribuido",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
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
app.include_router(assets_router, prefix="/api/v1")
app.include_router(warehouses_router, prefix="/api/v1")
app.include_router(inventory_router, prefix="/api/v1")
app.include_router(transfers_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")


@app.exception_handler(OperationalError)
async def handle_db_operational_error(_request: Request, exc: OperationalError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "code": "DB_CONNECTION_FAILED",
            "detail": (
                "No se pudo conectar a PostgreSQL. "
                "Levantá el contenedor con: cd infra && docker compose up -d postgres. "
                f"Causa técnica: {exc.orig if getattr(exc, 'orig', None) else exc}"
            ),
        },
    )


@app.exception_handler(SQLAlchemyError)
async def handle_sqlalchemy_error(_request: Request, exc: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "code": "DB_ERROR",
            "detail": f"Error de base de datos durante la operación. Causa técnica: {exc}",
        },
    )


@app.on_event("startup")
def log_registered_routes() -> None:
    import logging

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
