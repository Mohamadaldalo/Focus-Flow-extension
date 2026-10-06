export interface Website {
  id: string;
  domain: string;
  label: string | null;
  created_at: string;
}

export type SessionType = "focus" | "short_break" | "long_break" | "custom";
export type SessionStatus = "active" | "paused" | "completed" | "cancelled";

export interface FocusSession {
  id: string;
  session_type: SessionType;
  status: SessionStatus;
  planned_duration_minutes: number;
  start_time: string;
  end_time: string | null;
  paused_at: string | null;
  paused_total_seconds: number;
  cycle_count: number;
}

export interface UserSettings {
  focus_duration_minutes: number;
  break_duration_minutes: number;
  long_break_duration_minutes: number;
  sessions_before_long_break: number;
  notifications_enabled: boolean;
  sound_enabled: boolean;
  cooldown_seconds: number;
}

export interface Stats {
  today_focus_minutes: number;
  week_focus_minutes: number;
  month_focus_minutes: number;
  completed_sessions_count: number;
  longest_session_minutes: number;
  current_streak_days: number;
  daily_breakdown: { date: string; minutes: number }[];
}

export type CooldownAction = "stop_session" | "disable_protection" | "edit_allowlist";

export interface CooldownStatus {
  cooldown_id: string;
  action: CooldownAction;
  seconds_remaining: number;
  ready: boolean;
}

export interface ApiError {
  detail: string;
}
