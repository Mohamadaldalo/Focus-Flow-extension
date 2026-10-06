import { FormEvent, useEffect, useState } from "react";
import { api, ApiException } from "../api/client";
import { Layout } from "../components/Layout";
import type { UserSettings } from "../types";

export default function Settings() {
  const [settings, setSettings]                       = useState<UserSettings | null>(null);
  const [loading, setLoading]                         = useState(true);
  const [focusMinutes, setFocusMinutes]               = useState(25);
  const [breakMinutes, setBreakMinutes]               = useState(5);
  const [longBreakMinutes, setLongBreakMinutes]       = useState(15);
  const [sessionsBeforeLongBreak, setSessionsBeforeLongBreak] = useState(4);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled]               = useState(true);
  const [password, setPassword]                       = useState("");
  const [savedMessage, setSavedMessage]               = useState<string | null>(null);
  const [error, setError]                             = useState<string | null>(null);
  const [currentPassword, setCurrentPassword]         = useState("");
  const [newPassword, setNewPassword]                 = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm]   = useState("");
  const [passwordMessage, setPasswordMessage]         = useState<string | null>(null);
  const [passwordError, setPasswordError]             = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setFocusMinutes(s.focus_duration_minutes);
      setBreakMinutes(s.break_duration_minutes);
      setLongBreakMinutes(s.long_break_duration_minutes);
      setSessionsBeforeLongBreak(s.sessions_before_long_break);
      setNotificationsEnabled(s.notifications_enabled);
      setSoundEnabled(s.sound_enabled);
    }).finally(() => setLoading(false));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null); setSavedMessage(null);
    if (!password) { setError("Enter your password to save settings."); return; }
    try {
      const updated = await api.updateSettings(password, {
        focus_duration_minutes: focusMinutes,
        break_duration_minutes: breakMinutes,
        long_break_duration_minutes: longBreakMinutes,
        sessions_before_long_break: sessionsBeforeLongBreak,
        notifications_enabled: notificationsEnabled,
        sound_enabled: soundEnabled,
      });
      setSettings(updated);
      setPassword("");
      setSavedMessage("Settings saved.");
    } catch (e) {
      setError(e instanceof ApiException ? e.message : "Could not save settings.");
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null); setPasswordMessage(null);
    if (newPassword !== newPasswordConfirm) { setPasswordError("New passwords don't match."); return; }
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword(""); setNewPasswordConfirm("");
      setPasswordMessage("Password updated successfully.");
    } catch (e) {
      setPasswordError(e instanceof ApiException ? e.message : "Could not change password.");
    }
  }

  if (loading || !settings) return <Layout><p className="text-muted">Loading…</p></Layout>;

  return (
    <Layout>
      <h1 className="font-display text-3xl text-paper">Settings</h1>
      <p className="mt-1 text-sm text-muted">Tune your Pomodoro cycle and notifications.</p>

      <form onSubmit={handleSave} className="mt-6 max-w-lg rounded-2xl border border-surface-line bg-surface p-6">
        <p className="font-display text-lg text-paper">Timer</p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-muted mb-2">Focus duration (min)</span>
            <input type="number" min={1} max={180} value={focusMinutes}
              onChange={(e) => setFocusMinutes(Number(e.target.value))} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-muted mb-2">Break duration (min)</span>
            <input type="number" min={1} max={60} value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value))} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-muted mb-2">Long break (min)</span>
            <input type="number" min={1} max={120} value={longBreakMinutes}
              onChange={(e) => setLongBreakMinutes(Number(e.target.value))} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-muted mb-2">Sessions before long break</span>
            <input type="number" min={1} max={12} value={sessionsBeforeLongBreak}
              onChange={(e) => setSessionsBeforeLongBreak(Number(e.target.value))} className="input" />
          </label>
        </div>

        <p className="mt-6 font-display text-lg text-paper">Notifications</p>
        <div className="mt-3 flex flex-col gap-3">
          <Toggle label="Desktop notifications" checked={notificationsEnabled} onChange={setNotificationsEnabled} />
          <Toggle label="Sound"                 checked={soundEnabled}          onChange={setSoundEnabled} />
        </div>

        <div className="mt-6 border-t border-surface-line pt-5">
          <label className="block text-xs uppercase tracking-wider text-muted mb-2">
            Confirm with your password to save
          </label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="input" placeholder="Password" />
          {error        && <p className="mt-2 text-sm text-red">{error}</p>}
          {savedMessage && <p className="mt-2 text-sm text-gold">{savedMessage}</p>}
          <button type="submit" className="mt-4 rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-glow">
            Save settings
          </button>
        </div>
      </form>

      <form onSubmit={handleChangePassword} className="mt-6 max-w-lg rounded-2xl border border-surface-line bg-surface p-6">
        <p className="font-display text-lg text-paper">Change password</p>
        <div className="mt-4 flex flex-col gap-3">
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password" className="input" />
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password" className="input" />
          <input type="password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)}
            placeholder="Confirm new password" className="input" />
        </div>
        {passwordError   && <p className="mt-2 text-sm text-red">{passwordError}</p>}
        {passwordMessage && <p className="mt-2 text-sm text-gold">{passwordMessage}</p>}
        <button type="submit" className="mt-4 rounded-lg border border-surface-line px-4 py-2 text-sm font-medium text-paper hover:bg-surface-raised">
          Update password
        </button>
      </form>
    </Layout>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="flex items-center justify-between rounded-lg border border-surface-line px-4 py-2.5 text-left">
      <span className="text-sm text-paper">{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-blue" : "bg-surface-line"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}