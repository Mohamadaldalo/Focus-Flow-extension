"""
Shared helpers for the 60-second cooldown protection flow.

Flow:
  1. Client calls POST /cooldown/initiate with the action name + password.
     Server verifies the password and creates a CooldownRequest row.
  2. Client polls GET /cooldown/{id} (or just waits client-side) until
     `ready` is true, i.e. `cooldown_seconds` have elapsed since `requested_at`.
  3. Client retries the original sensitive action (stop session, disable
     protection, edit allow list) passing the cooldown_id. The endpoint
     calls `consume_cooldown` below, which validates and marks it used.

A cooldown request can only be consumed once and only for the action it was
created for, so a stale or reused id cannot be replayed.
"""
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .security import verify_password


def initiate_cooldown(db: Session, user: models.User, action: str, password: str) -> models.CooldownRequest:
    if not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")

    cooldown = models.CooldownRequest(
        user_id=user.id,
        action=action,
        cooldown_seconds=settings.cooldown_seconds,
    )
    db.add(cooldown)
    db.commit()
    db.refresh(cooldown)
    return cooldown


def seconds_remaining(cooldown: models.CooldownRequest) -> int:
    elapsed = (datetime.utcnow() - cooldown.requested_at).total_seconds()
    remaining = cooldown.cooldown_seconds - elapsed
    return max(0, int(remaining))


def consume_cooldown(db: Session, user: models.User, cooldown_id: str, action: str) -> None:
    """Validate a cooldown_id is ready and matches the action, then mark it confirmed."""
    cooldown = db.get(models.CooldownRequest, cooldown_id)

    if cooldown is None or cooldown.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cooldown request not found")
    if cooldown.action != action:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cooldown request was issued for a different action")
    if cooldown.confirmed:
        raise HTTPException(status.HTTP_409_CONFLICT, "This cooldown has already been used")
    if seconds_remaining(cooldown) > 0:
        raise HTTPException(
            status.HTTP_425_TOO_EARLY,
            f"Cooldown not yet elapsed: {seconds_remaining(cooldown)}s remaining",
        )

    cooldown.confirmed = True
    db.commit()
