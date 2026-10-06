"""
SQLAlchemy ORM models for FocusFlow.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import relationship

from .database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    websites = relationship("AllowedWebsite", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("FocusSession", back_populates="user", cascade="all, delete-orphan")


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, unique=True)

    focus_duration_minutes = Column(Integer, default=25)
    break_duration_minutes = Column(Integer, default=5)
    long_break_duration_minutes = Column(Integer, default=15)
    sessions_before_long_break = Column(Integer, default=4)

    notifications_enabled = Column(Boolean, default=True)
    sound_enabled = Column(Boolean, default=True)
    cooldown_seconds = Column(Integer, default=60)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="settings")


class AllowedWebsite(Base):
    __tablename__ = "allowed_websites"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    domain = Column(String, nullable=False, index=True)
    label = Column(String, nullable=True)  # optional friendly name, e.g. "Course portal"
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="websites")


class SessionType(str, enum.Enum):
    focus = "focus"
    short_break = "short_break"
    long_break = "long_break"
    custom = "custom"


class SessionStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    completed = "completed"
    cancelled = "cancelled"


class FocusSession(Base):
    __tablename__ = "focus_sessions"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)

    session_type = Column(Enum(SessionType), default=SessionType.focus)
    status = Column(Enum(SessionStatus), default=SessionStatus.active)

    planned_duration_minutes = Column(Integer, nullable=False)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    paused_at = Column(DateTime, nullable=True)  # set while status == paused; cleared on resume
    paused_total_seconds = Column(Integer, default=0)  # accumulated paused time, excluded from focus credit

    cycle_count = Column(Integer, default=1)  # which pomodoro cycle number this belongs to, for streak/long-break logic

    user = relationship("User", back_populates="sessions")


class CooldownRequest(Base):
    """
    Tracks an in-progress 60-second cooldown for a sensitive action
    (stop session / disable protection / edit allow list mid-session).
    The frontend polls/waits out the cooldown, then calls the action
    endpoint again with the cooldown token to confirm.
    """
    __tablename__ = "cooldown_requests"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)  # e.g. "stop_session", "disable_protection", "edit_allowlist"
    requested_at = Column(DateTime, default=datetime.utcnow)
    cooldown_seconds = Column(Integer, default=60)
    confirmed = Column(Boolean, default=False)


class OnlinePresence(Base):
    """
    Tracks active client connections via periodic heartbeat pings.
    Each browser tab generates a unique client_id (UUID stored in localStorage).
    A client is considered online if last_seen is within the last 120 seconds.
    """
    __tablename__ = "online_presence"

    client_id = Column(String, primary_key=True)  # browser-generated UUID
    last_seen = Column(DateTime, default=datetime.utcnow)
    label = Column(String, nullable=True)


class ExamStatus(str, enum.Enum):
    active = "active"
    ended = "ended"


class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id = Column(String, primary_key=True, default=gen_uuid)
    supervisor_code = Column(String, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    allowed_domains_json = Column(String, nullable=False)
    status = Column(Enum(ExamStatus), default=ExamStatus.active)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)

    violations = relationship("ExamViolation", back_populates="exam", cascade="all, delete-orphan")


class ViolationType(str, enum.Enum):
    blocked_site = "blocked_site"
    tab_switch = "tab_switch"
    extension_removed = "extension_removed"  # logged when student removes extension


class ExamViolation(Base):
    __tablename__ = "exam_violations"

    id = Column(String, primary_key=True, default=gen_uuid)
    exam_id = Column(String, ForeignKey("exam_sessions.id"), nullable=False)
    client_id = Column(String, nullable=False)
    violation_type = Column(Enum(ViolationType), nullable=False)
    domain = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    exam = relationship("ExamSession", back_populates="violations")