"""
Focus session lifecycle: start, pause, resume, complete (automatic, by the
client when the timer reaches zero), and stop/disable (protected by a
mandatory cooldown, since this is the "I want to bail" path).
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..cooldown import consume_cooldown
from ..database import get_db
from ..deps import get_current_user
from ..security import verify_password

router = APIRouter(prefix="/sessions", tags=["sessions"])

_TYPE_MAP = {
    "focus": models.SessionType.focus,
    "short_break": models.SessionType.short_break,
    "long_break": models.SessionType.long_break,
    "custom": models.SessionType.custom,
}


def _active_or_paused(db: Session, user_id: str) -> models.FocusSession | None:
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


@router.get("/active", response_model=schemas.SessionResponse | None)
def get_active_session(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Used by the dashboard and the Chrome extension to know whether blocking should be active."""
    return _active_or_paused(db, current_user.id)


@router.get("", response_model=list[schemas.SessionResponse])
def list_sessions(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.FocusSession)
        .filter(models.FocusSession.user_id == current_user.id)
        .order_by(models.FocusSession.start_time.desc())
        .limit(limit)
        .all()
    )


@router.post("/start", response_model=schemas.SessionResponse, status_code=status.HTTP_201_CREATED)
def start_session(
    payload: schemas.SessionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if _active_or_paused(db, current_user.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A session is already active or paused")

    session_type = _TYPE_MAP.get(payload.session_type, models.SessionType.custom)

    # cycle_count: increment from the most recent session of any type for this user
    last = (
        db.query(models.FocusSession)
        .filter(models.FocusSession.user_id == current_user.id)
        .order_by(models.FocusSession.start_time.desc())
        .first()
    )
    cycle_count = (last.cycle_count + 1) if (last and last.session_type == models.SessionType.focus) else (
        last.cycle_count if last else 1
    )

    session = models.FocusSession(
        user_id=current_user.id,
        session_type=session_type,
        status=models.SessionStatus.active,
        planned_duration_minutes=payload.planned_duration_minutes,
        cycle_count=cycle_count,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/pause", response_model=schemas.SessionResponse)
def pause_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = _get_owned_session(db, current_user.id, session_id)
    if session.status != models.SessionStatus.active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only an active session can be paused")

    session.status = models.SessionStatus.paused
    session.paused_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/resume", response_model=schemas.SessionResponse)
def resume_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = _get_owned_session(db, current_user.id, session_id)
    if session.status != models.SessionStatus.paused:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only a paused session can be resumed")

    if session.paused_at is not None:
        elapsed = (datetime.utcnow() - session.paused_at).total_seconds()
        session.paused_total_seconds += int(elapsed)
        session.paused_at = None

    session.status = models.SessionStatus.active
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/complete", response_model=schemas.SessionResponse)
def complete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Called by the client when the countdown naturally reaches zero. No cooldown required —
    this is the timer finishing on its own, not the user bypassing it."""
    session = _get_owned_session(db, current_user.id, session_id)
    if session.status not in (models.SessionStatus.active, models.SessionStatus.paused):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session is not running")

    if session.paused_at is not None:
        session.paused_total_seconds += int((datetime.utcnow() - session.paused_at).total_seconds())
        session.paused_at = None

    session.status = models.SessionStatus.completed
    session.end_time = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/stop", response_model=schemas.SessionResponse)
def stop_session(
    session_id: str,
    payload: schemas.SessionStopRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Stopping early / disabling protection mid-session. Requires password + a
    confirmed 60s cooldown (action='stop_session') to discourage impulsive bailing."""
    session = _get_owned_session(db, current_user.id, session_id)
    if session.status not in (models.SessionStatus.active, models.SessionStatus.paused):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session is not running")

    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")

    consume_cooldown(db, current_user, payload.cooldown_id, "stop_session")

    if session.paused_at is not None:
        session.paused_total_seconds += int((datetime.utcnow() - session.paused_at).total_seconds())
        session.paused_at = None

    session.status = models.SessionStatus.cancelled
    session.end_time = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


def _get_owned_session(db: Session, user_id: str, session_id: str) -> models.FocusSession:
    session = db.get(models.FocusSession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return session
