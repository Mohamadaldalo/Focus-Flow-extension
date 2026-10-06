"""
Allow-list management. Adding or removing a site always requires the master
password. If a focus session is currently active, it additionally requires a
confirmed cooldown (action="edit_allowlist") so the list can't be loosened
on impulse mid-session.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..cooldown import consume_cooldown
from ..database import get_db
from ..deps import get_current_user
from ..security import verify_password

router = APIRouter(prefix="/allowlist", tags=["allowlist"])


def _active_session(db: Session, user_id: str) -> models.FocusSession | None:
    return (
        db.query(models.FocusSession)
        .filter(
            models.FocusSession.user_id == user_id,
            or_(
                models.FocusSession.status == models.SessionStatus.active,
                models.FocusSession.status == models.SessionStatus.paused,
            ),
        )
        .first()
    )


@router.get("", response_model=list[schemas.WebsiteResponse])
def list_websites(
    q: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.AllowedWebsite).filter(models.AllowedWebsite.user_id == current_user.id)
    if q:
        query = query.filter(models.AllowedWebsite.domain.contains(q.lower()))
    return query.order_by(models.AllowedWebsite.domain).all()


@router.post("", response_model=schemas.WebsiteResponse, status_code=status.HTTP_201_CREATED)
def add_website(
    payload: schemas.WebsiteCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")

    if _active_session(db, current_user.id) is not None:
        if not payload.cooldown_id:
            raise HTTPException(
                status.HTTP_428_PRECONDITION_REQUIRED,
                "A focus session is active; initiate a cooldown for 'edit_allowlist' first",
            )
        consume_cooldown(db, current_user, payload.cooldown_id, "edit_allowlist")

    existing = (
        db.query(models.AllowedWebsite)
        .filter(models.AllowedWebsite.user_id == current_user.id, models.AllowedWebsite.domain == payload.domain)
        .first()
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Domain is already on the allow list")

    website = models.AllowedWebsite(user_id=current_user.id, domain=payload.domain, label=payload.label)
    db.add(website)
    db.commit()
    db.refresh(website)
    return website


@router.delete("/{website_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_website(
    website_id: str,
    payload: schemas.WebsiteDelete,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")

    website = db.get(models.AllowedWebsite, website_id)
    if website is None or website.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Website not found")

    if _active_session(db, current_user.id) is not None:
        if not payload.cooldown_id:
            raise HTTPException(
                status.HTTP_428_PRECONDITION_REQUIRED,
                "A focus session is active; initiate a cooldown for 'edit_allowlist' first",
            )
        consume_cooldown(db, current_user, payload.cooldown_id, "edit_allowlist")

    db.delete(website)
    db.commit()
