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
    service = AuthService(db)
    user = service.authenticate(credentials.email, credentials.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
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
