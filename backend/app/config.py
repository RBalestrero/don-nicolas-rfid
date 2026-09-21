from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # development | production
    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_debug: bool = True
    # En producción debe ser una clave fuerte (>= 32 chars). Ver validate_security_settings().
    secret_key: str = "dev-secret-key-change-in-production"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    # None = automático (docs on en development, off en production)
    expose_api_docs: bool | None = None

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "don_nicolas_rfid"
    postgres_user: str = "rfid_admin"
    postgres_password: str = "changeme"

    cors_origins: str = "http://localhost:5174,http://localhost:5173,http://localhost:3000"

    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 10
    max_request_body_mb: int = 12

    rate_limit_enabled: bool = True
    login_rate_limit_per_minute: int = 10
    api_rate_limit_per_minute: int = 300
    login_max_failures: int = 5
    login_lockout_seconds: int = 300

    # Clientes móviles autorizados a operar inventarios (header X-Client)
    inventory_mobile_clients: str = "mc33,mc33-apk"
    # Si no está vacío, exige header X-Inventory-Client-Secret en writes de inventario.
    # Endurece el canal MC33 frente a spoofing de X-Client con un token de APK.
    inventory_client_secret: str = ""
    # Si true, confiar en X-Forwarded-For (solo detrás de proxy/nginx que lo sanee).
    trust_x_forwarded_for: bool = False

    zebra_printer_host: str = "192.168.1.20"
    zebra_printer_port: int = 9100
    zebra_printer_simulate: bool = True
    zebra_printer_timeout: int = 5

    # Presencia MC33: online si sesion_activa y último heartbeat dentro del timeout.
    device_online_timeout_seconds: int = 180

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def inventory_mobile_clients_set(self) -> set[str]:
        return {
            item.strip().lower()
            for item in self.inventory_mobile_clients.split(",")
            if item.strip()
        }

    @property
    def is_production(self) -> bool:
        return self.app_env.strip().lower() in {"production", "prod"}

    @property
    def docs_enabled(self) -> bool:
        if self.expose_api_docs is not None:
            return self.expose_api_docs
        return not self.is_production


WEAK_SECRETS = {
    "dev-secret-key-change-in-production",
    "generar-clave-segura-aqui",
    "generar-clave-segura-aqui-con-al-menos-32c",
    "changeme",
    "secret",
    "password",
}

WEAK_SECRET_PREFIXES = (
    "generar-clave-segura",
    "dev-secret",
    "dev-only",
    "changeme",
    "example",
    "placeholder",
)


def _is_weak_secret(value: str) -> bool:
    lowered = value.strip().lower()
    if not lowered or lowered in WEAK_SECRETS:
        return True
    return any(lowered.startswith(prefix) for prefix in WEAK_SECRET_PREFIXES)


def validate_security_settings(settings: Settings | None = None) -> None:
    """Falla el arranque si la config de producción es insegura."""
    cfg = settings or get_settings()
    if not cfg.is_production:
        return

    secret = cfg.secret_key.strip()
    if len(secret) < 32 or _is_weak_secret(secret):
        raise RuntimeError(
            "SECRET_KEY insegura o corta (<32). Definí una clave fuerte en producción."
        )
    if cfg.api_debug:
        raise RuntimeError("API_DEBUG debe ser false en producción (APP_ENV=production).")
    if _is_weak_secret(cfg.postgres_password) or not cfg.postgres_password.strip():
        raise RuntimeError("POSTGRES_PASSWORD débil o vacío en producción.")


@lru_cache
def get_settings() -> Settings:
    return Settings()
