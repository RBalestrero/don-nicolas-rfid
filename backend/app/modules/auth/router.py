from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.database import get_db
from app.dependencies import get_current_user
from app.modules.auth.models import Usuario
from app.modules.auth.schemas import LoginRequest, TokenResponse, UserResponse
from app.modules.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login", response_model=TokenResponse)
def login(credentials: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        service = AuthService(db)
        user = service.authenticate(credentials.email, credentials.password)
    except Exception as exc:
        # Dejar que los handlers globales de SQLAlchemy respondan 503 tipado.
        # Cualquier otra falla se reporta con código explícito.
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "AUTH_INVALID_CREDENTIALS",
                "message": "Credenciales inválidas: email o contraseña incorrectos",
            },
        )

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
    )
