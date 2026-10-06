"""
Endpoints for initiating and checking the 60-second cooldown required before
stopping a session, disabling protection, or editing the allow list mid-session.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..cooldown import initiate_cooldown, seconds_remaining
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/cooldown", tags=["cooldown"])

VALID_ACTIONS = {"stop_session", "disable_protection", "edit_allowlist"}


@router.post("/initiate", response_model=schemas.CooldownStatusResponse, status_code=status.HTTP_201_CREATED)
def initiate(
    payload: schemas.CooldownInitiate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if payload.action not in VALID_ACTIONS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown action '{payload.action}'")

    cooldown = initiate_cooldown(db, current_user, payload.action, payload.password)
    return schemas.CooldownStatusResponse(
        cooldown_id=cooldown.id,
        action=cooldown.action,
        seconds_remaining=seconds_remaining(cooldown),
        ready=False,
    )


@router.get("/{cooldown_id}", response_model=schemas.CooldownStatusResponse)
def status_check(
    cooldown_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cooldown = db.get(models.CooldownRequest, cooldown_id)
    if cooldown is None or cooldown.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cooldown request not found")

    remaining = seconds_remaining(cooldown)
    return schemas.CooldownStatusResponse(
        cooldown_id=cooldown.id,
        action=cooldown.action,
        seconds_remaining=remaining,
        ready=remaining == 0 and not cooldown.confirmed,
    )
