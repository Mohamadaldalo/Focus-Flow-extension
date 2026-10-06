import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { useAuth } from "../context/AuthContext";
import { ApiException } from "../api/client";

export default function Login() {
  const { isAuthenticated, accountExists, loading, login, setup } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;
  if (loading) return <div className="flex h-screen items-center justify-center text-muted">Loading FocusFlow…</div>;

  const isSetup = accountExists === false;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isSetup && password !== confirmPassword) { setError("Passwords don't match."); return; }
    setSubmitting(true);
    try {
      if (isSetup) await setup(password);
      else await login(password);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : "Something went wrong. Is the backend running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Logo size={44} />
          <h1 className="mt-4 font-display text-3xl text-paper">FocusFlow</h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-blue font-medium">Near East University</p>
          <p className="mt-3 text-sm text-muted">
            {isSetup
              ? "Set a master password to protect your focus sessions and allow list."
              : "Enter your master password to continue."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-muted mb-2">
              {isSetup ? "Create password" : "Password"}
            </label>
            <input
              type="password" autoFocus value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-surface-line bg-surface px-3 py-2.5 text-paper outline-none focus:border-blue"
              placeholder={isSetup ? "At least 8 characters, with a letter and a number" : "••••••••"}
            />
          </div>

          {isSetup && (
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted mb-2">Confirm password</label>
              <input
                type="password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-surface-line bg-surface px-3 py-2.5 text-paper outline-none focus:border-blue"
                placeholder="Repeat password"
              />
            </div>
          )}

          {error && <p className="text-sm text-red">{error}</p>}

          <button
            type="submit" disabled={submitting}
            className="mt-2 rounded-lg bg-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-glow disabled:opacity-50"
          >
            {submitting ? "Please wait…" : isSetup ? "Create account" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Your password is hashed with bcrypt and never leaves this device in plain text.
        </p>
      </div>
    </div>
  );
}