import { useEffect, useRef, useState } from "react";
import { api, ApiException } from "../api/client";
import type { CooldownAction } from "../types";

interface CooldownModalProps {
  open: boolean;
  action: CooldownAction;
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirmed: (password: string, cooldownId: string) => Promise<void>;
}

type Step = "password" | "waiting" | "ready" | "working";

const ACTION_LABEL: Record<CooldownAction, string> = {
  stop_session:       "Stop session",
  disable_protection: "Disable protection",
  edit_allowlist:     "Edit allow list",
};

export function CooldownModal({
  open, action, title, description, confirmLabel, onCancel, onConfirmed,
}: CooldownModalProps) {
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [cooldownId, setCooldownId] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("password");
      setPassword("");
      setCooldownId(null);
      setSecondsRemaining(60);
      setError(null);
      if (pollRef.current) window.clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [open]);

  if (!open) return null;

  async function startCooldown() {
    setError(null);
    if (!password) { setError("Enter your password to continue."); return; }
    try {
      const res = await api.initiateCooldown(action, password);
      setCooldownId(res.cooldown_id);
      setSecondsRemaining(res.seconds_remaining);
      setStep(res.ready ? "ready" : "waiting");

      pollRef.current = window.setInterval(async () => {
        try {
          const status = await api.cooldownStatus(res.cooldown_id);
          setSecondsRemaining(status.seconds_remaining);
          if (status.ready) {
            setStep("ready");
            if (pollRef.current) window.clearInterval(pollRef.current);
          }
        } catch { /* transient — keep polling */ }
      }, 1000);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : "Could not start cooldown.");
    }
  }

  async function confirm() {
    if (!cooldownId) return;
    setStep("working");
    setError(null);
    try {
      await onConfirmed(password, cooldownId);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : "Something went wrong.");
      setStep("ready");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-surface-line bg-surface-raised p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-wider text-red">{ACTION_LABEL[action]} · protected action</p>
        <h2 className="mt-2 font-display text-xl text-paper">{title}</h2>
        <p className="mt-2 text-sm text-muted">{description}</p>

        {step === "password" && (
          <div className="mt-5">
            <label className="block text-xs uppercase tracking-wider text-muted mb-2">Master password</label>
            <input
              type="password" autoFocus value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startCooldown()}
              className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-paper outline-none focus:border-blue"
              placeholder="Enter password"
            />
            {error && <p className="mt-2 text-sm text-red">{error}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-paper">
                Cancel
              </button>
              <button
                onClick={startCooldown}
                className="rounded-lg bg-red px-4 py-2 text-sm font-medium text-white hover:bg-red-dim"
              >
                Start 60s cooldown
              </button>
            </div>
          </div>
        )}

        {(step === "waiting" || step === "ready" || step === "working") && (
          <div className="mt-6 flex flex-col items-center">
            <div className="relative flex h-28 w-28 items-center justify-center">
              <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke="#263D6B" strokeWidth="6" />
                <circle
                  cx="50" cy="50" r="44" fill="none"
                  stroke={step === "ready" || step === "working" ? "#D4A017" : "#C8102E"}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 44}
                  strokeDashoffset={(2 * Math.PI * 44 * secondsRemaining) / 60}
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.4s ease" }}
                />
              </svg>
              <span className="font-mono text-2xl tabular-nums">
                {step === "ready" || step === "working" ? "✓" : secondsRemaining}
              </span>
            </div>
            <p className="mt-4 text-center text-sm text-muted">
              {step === "waiting" && "Waiting out the cooldown so this can't be done on impulse."}
              {step === "ready"   && "Cooldown complete. You can proceed now."}
              {step === "working" && "Working…"}
            </p>
            {error && <p className="mt-2 text-sm text-red">{error}</p>}
            <div className="mt-5 flex justify-end gap-3 self-stretch">
              <button onClick={onCancel} disabled={step === "working"} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-paper">
                Keep going instead
              </button>
              <button
                onClick={confirm}
                disabled={step !== "ready"}
                className="rounded-lg bg-red px-4 py-2 text-sm font-medium text-white hover:bg-red-dim disabled:cursor-not-allowed disabled:opacity-40"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}