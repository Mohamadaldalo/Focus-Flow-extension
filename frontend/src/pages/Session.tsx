import { useEffect, useRef, useState } from "react";
import { api, ApiException } from "../api/client";
import { ApertureTimer } from "../components/ApertureTimer";
import { CooldownModal } from "../components/CooldownModal";
import { Layout } from "../components/Layout";
import type { FocusSession, SessionType, UserSettings, Website } from "../types";

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function computeRemainingSeconds(session: FocusSession, nowMs: number): number {
  const startMs = new Date(session.start_time + "Z").getTime();
  const referenceNow =
    session.status === "paused" && session.paused_at
      ? new Date(session.paused_at + "Z").getTime()
      : nowMs;
  const elapsed = (referenceNow - startMs) / 1000 - session.paused_total_seconds;
  return Math.max(0, session.planned_duration_minutes * 60 - elapsed);
}

const MODE_LABEL: Record<SessionType, string> = {
  focus:       "Focus session",
  short_break: "Short break",
  long_break:  "Long break",
  custom:      "Custom session",
};

export default function Session() {
  const [session, setSession]               = useState<FocusSession | null>(null);
  const [settings, setSettings]             = useState<UserSettings | null>(null);
  const [websites, setWebsites]             = useState<Website[]>([]);
  const [loading, setLoading]               = useState(true);
  const [tick, setTick]                     = useState(0);
  const [duration, setDuration]             = useState(25);
  const [customDuration, setCustomDuration] = useState(45);
  const [useCustom, setUseCustom]           = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [showStopModal, setShowStopModal]   = useState(false);
  const completingRef                       = useRef(false);

  async function refresh() {
    try {
      const [s, settingsRes, sites] = await Promise.all([
        api.getActiveSession(), api.getSettings(), api.listWebsites(),
      ]);
      setSession(s);
      setSettings(settingsRes);
      setWebsites(sites);
      if (settingsRes) setDuration(settingsRes.focus_duration_minutes);
    } catch (e) {
      if (e instanceof ApiException && e.status === 401) return;
      setError(e instanceof ApiException ? e.message : "Could not reach the backend.");
    }
  }

  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingSeconds = session ? computeRemainingSeconds(session, Date.now()) : 0;

  useEffect(() => {
    if (!session || session.status !== "active" || completingRef.current) return;
    if (remainingSeconds > 0) return;
    completingRef.current = true;
    api.completeSession(session.id)
      .then(() => refresh())
      .catch(() => refresh())
      .finally(() => { completingRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, session?.id, session?.status]);

  async function handleStart(type: SessionType) {
    setError(null);
    const minutes =
      type !== "focus" && settings
        ? type === "short_break" ? settings.break_duration_minutes : settings.long_break_duration_minutes
        : useCustom ? customDuration : duration;
    try {
      await api.startSession(type, minutes);
      await refresh();
    } catch (e) {
      if (e instanceof ApiException && e.status === 401) return;
      setError(e instanceof ApiException ? e.message : "Could not start session.");
    }
  }

  async function handlePause() {
    if (!session) return;
    try { await api.pauseSession(session.id); refresh(); }
    catch (e) { if (e instanceof ApiException && e.status !== 401) setError(e.message); }
  }

  async function handleResume() {
    if (!session) return;
    try { await api.resumeSession(session.id); refresh(); }
    catch (e) { if (e instanceof ApiException && e.status !== 401) setError(e.message); }
  }

  async function confirmStop(password: string, cooldownId: string) {
    if (!session) return;
    await api.stopSession(session.id, password, cooldownId);
    setShowStopModal(false);
    refresh();
  }

  const isRunning = session && (session.status === "active" || session.status === "paused");

  return (
    <Layout>
      <h1 className="font-display text-3xl text-paper">Session</h1>
      <p className="mt-1 text-sm text-muted">
        {websites.length > 0
          ? `${websites.length} site${websites.length === 1 ? "" : "s"} stay reachable while this runs.`
          : "Your allow list is empty — everything will be blocked."}
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red/30 bg-red/10 px-4 py-2 text-sm text-red">
          {error}
        </p>
      )}

      <div className="mt-10 flex flex-col items-center">
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : isRunning && session ? (
          <>
            <ApertureTimer
              progress={1 - remainingSeconds / (session.planned_duration_minutes * 60)}
              timeLabel={formatTime(remainingSeconds)}
              modeLabel={MODE_LABEL[session.session_type]}
              tone={session.session_type === "focus" || session.session_type === "custom" ? "focus" : "break"}
            />
            <div className="mt-8 flex gap-3">
              {session.status === "active" ? (
                <button onClick={handlePause} className="rounded-lg border border-surface-line bg-surface px-5 py-2.5 text-sm font-medium text-paper hover:bg-surface-raised">
                  Pause
                </button>
              ) : (
                <button onClick={handleResume} className="rounded-lg bg-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-glow">
                  Resume
                </button>
              )}
              <button onClick={() => setShowStopModal(true)} className="rounded-lg border border-red/40 px-5 py-2.5 text-sm font-medium text-red hover:bg-red/10">
                Stop session
              </button>
            </div>
            {session.status === "paused" && (
              <p className="mt-4 text-sm text-muted">Paused — blocking stays active while paused.</p>
            )}
          </>
        ) : (
          <>
            <ApertureTimer
              progress={0}
              timeLabel={formatTime((useCustom ? customDuration : duration) * 60)}
              modeLabel="Ready to focus"
              tone="idle"
            />
            <div className="mt-8 flex flex-col items-center gap-4">
              <div className="flex gap-2">
                {[25, 50].map((m) => (
                  <button key={m}
                    onClick={() => { setDuration(m); setUseCustom(false); }}
                    className={`rounded-lg px-4 py-2 text-sm font-medium ${
                      !useCustom && duration === m
                        ? "bg-blue text-white"
                        : "border border-surface-line text-muted hover:text-paper"
                    }`}
                  >{m} min</button>
                ))}
                <button
                  onClick={() => setUseCustom(true)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    useCustom ? "bg-blue text-white" : "border border-surface-line text-muted hover:text-paper"
                  }`}
                >Custom</button>
              </div>

              {useCustom && (
                <input type="number" min={1} max={480} value={customDuration}
                  onChange={(e) => setCustomDuration(Number(e.target.value))}
                  className="w-32 rounded-lg border border-surface-line bg-surface px-3 py-2 text-center text-paper outline-none focus:border-blue"
                />
              )}

              <button onClick={() => handleStart("focus")} className="rounded-lg bg-blue px-6 py-3 text-sm font-medium text-white hover:bg-blue-glow">
                Start focus session
              </button>

              {settings && (
                <div className="flex gap-2 text-sm text-muted">
                  <button onClick={() => handleStart("short_break")} className="hover:text-gold">
                    Or start a {settings.break_duration_minutes}-min break
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <CooldownModal
        open={showStopModal}
        action="stop_session"
        title="Stop this focus session?"
        description="Stopping early disables blocking immediately. This requires your password and a 60-second cooldown so it can't be done on impulse."
        confirmLabel="Stop session"
        onCancel={() => setShowStopModal(false)}
        onConfirmed={confirmStop}
      />
    </Layout>
  );
}