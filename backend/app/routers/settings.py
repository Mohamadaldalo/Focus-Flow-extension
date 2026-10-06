"""
User (Pomodoro timer + notification) settings. Changing settings requires
the master password, per the spec, but no cooldown — settings only take
effect on the *next* session, so there's nothing to impulsively bypass.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..security import verify_password

router = APIRouter(prefix="/settings", tags=["settings"])


def _get_or_create_settings(db: Session, user: models.User) -> models.UserSettings:
    if user.settings is None:
        user.settings = models.UserSettings(user_id=user.id)
        db.add(user.settings)
        db.commit()
        db.refresh(user)
    return user.settings


@router.get("", response_model=schemas.SettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return _get_or_create_settings(db, current_user)


@router.put("", response_model=schemas.SettingsResponse)
def update_settings(
    payload: schemas.SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")

    user_settings = _get_or_create_settings(db, current_user)
    update_data = payload.model_dump(exclude={"password"}, exclude_unset=True)
    for field, value in update_data.items():
        setattr(user_settings, field, value)

    db.commit()
    db.refresh(user_settings)
    return user_settings
