"""
Aggregated statistics for the dashboard: focus time today/this week/this
month, completed session count, longest session, and a daily streak.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/stats", tags=["stats"])


def _session_minutes(session: models.FocusSession) -> int:
    """Actual focused minutes credited for a completed/cancelled session,
    excluding any paused time."""
    if session.end_time is None:
        return 0
    total_seconds = (session.end_time - session.start_time).total_seconds() - session.paused_total_seconds
    return max(0, int(total_seconds // 60))


@router.get("", response_model=schemas.StatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    focus_sessions = (
        db.query(models.FocusSession)
        .filter(
            models.FocusSession.user_id == current_user.id,
            models.FocusSession.session_type == models.SessionType.focus,
            models.FocusSession.status.in_([models.SessionStatus.completed, models.SessionStatus.cancelled]),
            models.FocusSession.end_time.isnot(None),
        )
        .all()
    )

    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = datetime(now.year, now.month, 1)

    today_minutes = sum(_session_minutes(s) for s in focus_sessions if s.start_time >= today_start)
    week_minutes = sum(_session_minutes(s) for s in focus_sessions if s.start_time >= week_start)
    month_minutes = sum(_session_minutes(s) for s in focus_sessions if s.start_time >= month_start)

    completed = [s for s in focus_sessions if s.status == models.SessionStatus.completed]
    longest = max((_session_minutes(s) for s in completed), default=0)

    # Daily breakdown for the last 14 days (for the dashboard chart)
    daily_breakdown = []
    for i in range(13, -1, -1):
        day = today_start - timedelta(days=i)
        day_end = day + timedelta(days=1)
        minutes = sum(_session_minutes(s) for s in focus_sessions if day <= s.start_time < day_end)
        daily_breakdown.append({"date": day.strftime("%Y-%m-%d"), "minutes": minutes})

    # Streak: consecutive days (ending today or yesterday) with at least one completed focus session
    days_with_focus = {s.start_time.date() for s in completed}
    streak = 0
    cursor = now.date()
    if cursor not in days_with_focus:
        cursor -= timedelta(days=1)
    while cursor in days_with_focus:
        streak += 1
        cursor -= timedelta(days=1)

    return schemas.StatsResponse(
        today_focus_minutes=today_minutes,
        week_focus_minutes=week_minutes,
        month_focus_minutes=month_minutes,
        completed_sessions_count=len(completed),
        longest_session_minutes=longest,
        current_streak_days=streak,
        daily_breakdown=daily_breakdown,
    )
