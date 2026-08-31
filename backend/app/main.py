from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import check_database_connection
from app.modules.assets.router import router as assets_router
from app.modules.auth.router import router as auth_router

settings = get_settings()

app = FastAPI(
    title="Don Nicolás RFID API",
    description="Sistema de gestión de activos, inventario y stock distribuido",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(assets_router, prefix="/api/v1")


@app.get("/api/v1/health", tags=["Sistema"])
def health_check() -> dict:
    db_ok = check_database_connection()
    return {
        "status": "ok" if db_ok else "degraded",
        "service": "don-nicolas-rfid-api",
        "version": "0.1.0",
        "database": "connected" if db_ok else "disconnected",
    }
