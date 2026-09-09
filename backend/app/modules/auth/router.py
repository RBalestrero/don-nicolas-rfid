import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.rate_limit import login_lockout
from app.core.security import create_access_token
from app.database import get_db
from app.dependencies import get_current_user
from app.modules.auth.models import Usuario
from app.modules.auth.schemas import LoginRequest, TokenResponse, UserResponse
from app.modules.auth.service import AuthService
from app.modules.auth.users_service import permissions_for_user

router = APIRouter(prefix="/auth", tags=["Autenticación"])
logger = logging.getLogger("don_nicolas.auth")


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


@router.post("/login", response_model=TokenResponse)
def login(
    credentials: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    settings = get_settings()
    ip = _client_ip(request)
    lock_key = f"{ip}:{credentials.email.lower()}"

    locked, retry = login_lockout.is_locked(
        lock_key,
        settings.login_max_failures,
        float(settings.login_lockout_seconds),
    )
    if locked:
        logger.warning("Login bloqueado por intentos fallidos ip=%s email=%s", ip, credentials.email)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "AUTH_LOCKED",
                "message": (
                    "Cuenta temporalmente bloqueada por intentos fallidos. "
                    f"Reintentá en {retry}s."
                ),
            },
            headers={"Retry-After": str(retry)},
        )

    try:
        service = AuthService(db)
        user = service.authenticate(credentials.email, credentials.password)
    except Exception as exc:
        from sqlalchemy.exc import SQLAlchemyError

        if isinstance(exc, SQLAlchemyError):
            raise
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "AUTH_LOGIN_UNEXPECTED",
                "message": f"Falla inesperada durante authenticate(): {exc}",
            },
        ) from exc

    if not user:
        login_lockout.record_failure(lock_key)
        logger.info("Login fallido ip=%s email=%s", ip, credentials.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "AUTH_INVALID_CREDENTIALS",
                "message": "Credenciales inválidas: email o contraseña incorrectos",
            },
        )

    login_lockout.clear_key(lock_key)
    token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "rol": user.rol.nombre}
    )
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: Usuario = Depends(get_current_user)) -> UserResponse:
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        nombre=current_user.nombre,
        rol=current_user.rol.nombre,
        permisos=permissions_for_user(current_user),
    )
