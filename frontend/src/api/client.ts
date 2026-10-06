/**
 * Thin fetch wrapper around the FocusFlow API.
 *
 * KEY CHANGE: any 401 response now clears the stored token and
 * redirects to /login immediately, so expired/invalid tokens
 * never leave the user stuck on a broken screen.
 */
import type {
  CooldownAction,
  CooldownStatus,
  FocusSession,
  SessionType,
  Stats,
  UserSettings,
  Website,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiException extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem("focusflow_token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("focusflow_token", token);
  else localStorage.removeItem("focusflow_token");
}

/** Called whenever the server returns 401 — clears state and boots to login. */
function handleUnauthorized() {
  setToken(null);
  // Use replace so the user can't "back" into the protected page
  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: { auth?: boolean } = { auth: true }
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (opts.auth !== false) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  // ── Global 401 handler ──────────────────────────────────────────────────
  // Any 401 means the token is missing, expired, or revoked.
  // Clear it and redirect so the user can log in again cleanly.
  if (res.status === 401 && opts.auth !== false) {
    handleUnauthorized();
    throw new ApiException(401, "Session expired — please log in again.");
  }
  // ────────────────────────────────────────────────────────────────────────

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const detail = (payload as any)?.detail ?? res.statusText ?? "Request failed";
    const message = typeof detail === "string" ? detail : JSON.stringify(detail);
    throw new ApiException(res.status, message);
  }

  return payload as T;
}

export const api = {
  // ---- auth ----
  authStatus: () =>
    request<{ initialized: boolean }>("GET", "/auth/status", undefined, { auth: false }),
  setup: (password: string) =>
    request<{ access_token: string }>("POST", "/auth/setup", { password }, { auth: false }),
  login: (password: string) =>
    request<{ access_token: string }>("POST", "/auth/login", { password }, { auth: false }),
  changePassword: (current_password: string, new_password: string) =>
    request<void>("POST", "/auth/change-password", { current_password, new_password }),

  // ---- allow list ----
  listWebsites: (q?: string) =>
    request<Website[]>("GET", `/allowlist${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  addWebsite: (domain: string, label: string | undefined, password: string, cooldown_id?: string) =>
    request<Website>("POST", "/allowlist", { domain, label, password, cooldown_id }),
  removeWebsite: (id: string, password: string, cooldown_id?: string) =>
    request<void>("DELETE", `/allowlist/${id}`, { password, cooldown_id }),

  // ---- sessions ----
  getActiveSession: () => request<FocusSession | null>("GET", "/sessions/active"),
  listSessions:     () => request<FocusSession[]>("GET", "/sessions"),
  startSession: (session_type: SessionType, planned_duration_minutes: number) =>
    request<FocusSession>("POST", "/sessions/start", { session_type, planned_duration_minutes }),
  pauseSession:    (id: string) => request<FocusSession>("POST", `/sessions/${id}/pause`),
  resumeSession:   (id: string) => request<FocusSession>("POST", `/sessions/${id}/resume`),
  completeSession: (id: string) => request<FocusSession>("POST", `/sessions/${id}/complete`),
  stopSession: (id: string, password: string, cooldown_id: string) =>
    request<FocusSession>("POST", `/sessions/${id}/stop`, { password, cooldown_id }),

  // ---- cooldown ----
  initiateCooldown: (action: CooldownAction, password: string) =>
    request<CooldownStatus>("POST", "/cooldown/initiate", { action, password }),
  cooldownStatus: (id: string) => request<CooldownStatus>("GET", `/cooldown/${id}`),

  // ---- settings ----
  getSettings: () => request<UserSettings>("GET", "/settings"),
  updateSettings: (password: string, patch: Partial<UserSettings>) =>
    request<UserSettings>("PUT", "/settings", { password, ...patch }),

  // ---- stats ----
  getStats: () => request<Stats>("GET", "/stats"),
};