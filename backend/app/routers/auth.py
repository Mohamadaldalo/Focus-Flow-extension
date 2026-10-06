"""
Account setup, login, and password change.

FocusFlow has exactly one local account. On first run there is no user row;
POST /auth/setup creates the master password. After that, /auth/login is
used to obtain a bearer token for subsequent requests.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status", response_model=schemas.AuthStatusResponse)
def auth_status(db: Session = Depends(get_db)):
    user = db.query(models.User).first()
    return schemas.AuthStatusResponse(initialized=user is not None)


@router.post("/setup", response_model=schemas.TokenResponse, status_code=status.HTTP_201_CREATED)
def setup(payload: schemas.SetupRequest, db: Session = Depends(get_db)):
    existing = db.query(models.User).first()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account already exists on this installation")

    user = models.User(password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()

    db.add(models.UserSettings(user_id=user.id))
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return schemas.TokenResponse(access_token=token)


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).first()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account exists yet; complete setup first")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")

    token = create_access_token(user.id)
    return schemas.TokenResponse(access_token=token)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: schemas.ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")

    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
