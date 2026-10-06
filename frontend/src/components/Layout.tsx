import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { OnlineTracker } from "./OnlineTracker";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { api, ApiException } from "../api/client";

const NAV_ITEMS = [
  { to: "/",          label: "Dashboard"  },
  { to: "/session",   label: "Session"    },
  { to: "/allowlist", label: "Allow list" },
  { to: "/exam",      label: "Exam Mode", badge: true },
  { to: "/settings",  label: "Settings"   },
];

function SunIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
}
function MoonIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
}

function LogoutModal({ onConfirm, onCancel }: { onConfirm: (password: string) => Promise<void>; onCancel: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit() {
    if (!password) { setError("Enter your password."); return; }
    setLoading(true);
    setError(null);
    try {
      await onConfirm(password);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : "Incorrect password.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-surface-line bg-surface-raised p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Confirm identity</p>
        <h2 className="font-display text-xl text-paper mb-2">Log out</h2>
        <p className="text-sm text-muted mb-5">Enter your master password to log out.</p>

        <input
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          placeholder="Master password"
          className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-blue mb-3"
        />

        {error && <p className="mb-3 text-sm text-red">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-muted hover:text-paper"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-dim disabled:opacity-50"
          >
            {loading ? "Checking…" : "Log out"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  async function handleLogoutConfirm(password: string) {
    // Verify the password by attempting a login call — if it succeeds the password is correct
    await api.login(password);  // throws ApiException(401) if wrong
    logout();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-surface-line bg-surface px-5 py-6">

        {/* Brand */}
        <div className="flex items-center gap-2 px-1">
          <Logo />
          <span className="font-display text-lg tracking-tight text-paper flex-1">FocusFlow</span>
          <button
            onClick={toggle}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-raised hover:text-paper"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-10 flex flex-col gap-1">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-surface-raised text-blue"
                    : "text-muted hover:bg-surface-raised hover:text-paper"
                }`
              }
            >
              {item.label}
              {item.badge && (
                <span className="rounded-full bg-red px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  NEW
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />
        <OnlineTracker />

        {/* Logout */}
        <button
          onClick={() => setShowLogoutModal(true)}
          className="mt-3 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface-raised hover:text-red"
        >
          Log out
        </button>
      </aside>

      <main className="flex-1 px-10 py-8">{children}</main>

      {/* Logout password modal */}
      {showLogoutModal && (
        <LogoutModal
          onConfirm={handleLogoutConfirm}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}
    </div>
  );
}