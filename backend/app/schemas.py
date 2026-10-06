"""
Pydantic request/response models.
"""
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


# ---------- Auth ----------

class SetupRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        if not any(c.isalpha() for c in v):
            raise ValueError("Password must contain at least one letter")
        return v


class LoginRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    has_account: bool = True


class AuthStatusResponse(BaseModel):
    initialized: bool


# ---------- Allow list ----------

class WebsiteCreate(BaseModel):
    domain: str = Field(min_length=1, max_length=253)
    label: str | None = None
    password: str
    cooldown_id: str | None = None  # required only if a focus session is currently active

    @field_validator("domain")
    @classmethod
    def normalize_domain(cls, v: str) -> str:
        v = v.strip().lower()
        v = v.removeprefix("https://").removeprefix("http://").removeprefix("www.")
        v = v.split("/")[0]
        if not v or " " in v:
            raise ValueError("Invalid domain")
        return v


class WebsiteDelete(BaseModel):
    password: str
    cooldown_id: str | None = None  # required only if a focus session is currently active


class WebsiteResponse(BaseModel):
    id: str
    domain: str
    label: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Sessions ----------

class SessionCreate(BaseModel):
    session_type: str = "focus"
    planned_duration_minutes: int = Field(gt=0, le=480)


class SessionStopRequest(BaseModel):
    password: str
    cooldown_id: str  # stopping/disabling always requires a completed cooldown


class SessionResponse(BaseModel):
    id: str
    session_type: str
    status: str
    planned_duration_minutes: int
    start_time: datetime
    end_time: datetime | None
    paused_at: datetime | None
    paused_total_seconds: int
    cycle_count: int

    model_config = {"from_attributes": True}


class SessionActionResponse(BaseModel):
    session: SessionResponse | None = None
    requires_cooldown: bool = False
    cooldown_id: str | None = None
    cooldown_seconds: int | None = None


# ---------- Cooldown ----------

class CooldownInitiate(BaseModel):
    action: str  # "stop_session" | "disable_protection" | "edit_allowlist"
    password: str


class CooldownStatusResponse(BaseModel):
    cooldown_id: str
    action: str
    seconds_remaining: int
    ready: bool


class CooldownConfirm(BaseModel):
    cooldown_id: str


# ---------- Settings ----------

class SettingsUpdate(BaseModel):
    password: str
    focus_duration_minutes: int | None = Field(default=None, gt=0, le=180)
    break_duration_minutes: int | None = Field(default=None, gt=0, le=60)
    long_break_duration_minutes: int | None = Field(default=None, gt=0, le=120)
    sessions_before_long_break: int | None = Field(default=None, gt=0, le=12)
    notifications_enabled: bool | None = None
    sound_enabled: bool | None = None


class SettingsResponse(BaseModel):
    focus_duration_minutes: int
    break_duration_minutes: int
    long_break_duration_minutes: int
    sessions_before_long_break: int
    notifications_enabled: bool
    sound_enabled: bool
    cooldown_seconds: int

    model_config = {"from_attributes": True}


# ---------- Stats ----------

class StatsResponse(BaseModel):
    today_focus_minutes: int
    week_focus_minutes: int
    month_focus_minutes: int
    completed_sessions_count: int
    longest_session_minutes: int
    current_streak_days: int
    daily_breakdown: list[dict]
