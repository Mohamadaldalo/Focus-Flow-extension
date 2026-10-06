import { FormEvent, useEffect, useState } from "react";
import { Layout } from "../components/Layout";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
function getToken() { return localStorage.getItem("focusflow_token") ?? ""; }

interface ExamActive { active: boolean; exam_id?: string; duration_minutes?: number; start_time?: string; allowed_domains?: string[]; remaining_seconds?: number; }
interface Violation { id: string; client_id: string; violation_type: string; domain: string | null; timestamp: string; }
interface ExamStats { exam_id: string; duration_minutes: number; start_time: string; remaining_seconds: number; allowed_domains: string[]; total_violations: number; tab_switches: number; blocked_attempts: number; extension_removals: number; violations: Violation[]; supervisor_code: string; }

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...((opts.headers as Record<string,string>) ?? {}) } });
  if (res.status === 204) return null;
  return res.json();
}

function fmt(seconds: number) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso + "Z").getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  return `${Math.round(diff / 60)}m ago`;
}

const VIOLATION_STYLE: Record<string, { label: string; className: string }> = {
  tab_switch:        { label: "Tab switch",         className: "bg-gold/20 text-gold" },
  blocked_site:      { label: "Blocked site",        className: "bg-red/20 text-red" },
  extension_removed: { label: "⚠ Extension removed", className: "bg-red/30 text-red font-bold" },
};

export default function ExamControl() {
  const [examActive, setExamActive] = useState<ExamActive | null>(null);
  const [stats, setStats]           = useState<ExamStats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [tick, setTick]             = useState(0);
  const [duration, setDuration]     = useState(90);
  const [domainInput, setDomainInput] = useState("");
  const [domains, setDomains]       = useState<string[]>([]);
  const [password, setPassword]     = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting]     = useState(false);
  const [newCode, setNewCode]       = useState<string | null>(null);
  const [endCode, setEndCode]       = useState("");
  const [endError, setEndError]     = useState<string | null>(null);
  const [ending, setEnding]         = useState(false);

  async function refresh() {
    const active: ExamActive = await apiFetch("/exam/active");
    setExamActive(active);
    if (active?.active) {
      try { const s: ExamStats = await apiFetch("/exam/stats"); setStats(s); } catch {}
    } else { setStats(null); }
  }

  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (tick % 10 === 0 && examActive?.active) refresh(); }, [tick]);

  const remainingSeconds = stats ? Math.max(0, stats.remaining_seconds - tick) : 0;

  function addDomain() {
    const d = domainInput.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0];
    if (!d || domains.includes(d)) return;
    setDomains(prev => [...prev, d]);
    setDomainInput("");
  }

  async function handleStart(e: FormEvent) {
    e.preventDefault();
    setStartError(null);
    if (!password) { setStartError("Password required."); return; }
    if (domains.length === 0) { setStartError("Add at least one allowed site."); return; }
    setStarting(true);
    try {
      const res = await apiFetch("/exam/start", { method: "POST", body: JSON.stringify({ password, duration_minutes: duration, allowed_domains: domains }) });
      if (res?.supervisor_code) { setNewCode(res.supervisor_code); setPassword(""); await refresh(); }
      else setStartError(res?.detail ?? "Could not start exam.");
    } catch { setStartError("Server error."); }
    finally { setStarting(false); }
  }

  async function handleEnd(e: FormEvent) {
    e.preventDefault();
    setEndError(null);
    if (!endCode.trim()) { setEndError("Enter the supervisor code."); return; }
    setEnding(true);
    try {
      const res = await apiFetch("/exam/end", { method: "POST", body: JSON.stringify({ supervisor_code: endCode.trim() }) });
      if (res === null) { setEndCode(""); setNewCode(null); await refresh(); }
      else setEndError(res?.detail ?? "Could not end exam.");
    } catch { setEndError("Server error."); }
    finally { setEnding(false); }
  }

  if (loading) return <Layout><p className="text-muted">Loading…</p></Layout>;

  return (
    <Layout>
      <h1 className="font-display text-3xl text-paper">Exam Mode</h1>
      <p className="mt-1 text-sm text-muted">
        Start a supervised exam lockdown. Only the supervisor code can end it early.
        Extension removal is automatically detected and logged.
      </p>

      {newCode && (
        <div className="mt-6 rounded-2xl border-2 border-blue bg-blue/10 p-5">
          <p className="text-xs uppercase tracking-wider text-blue font-medium mb-2">Exam started — save this code now</p>
          <p className="font-mono text-4xl font-bold text-paper tracking-widest">{newCode}</p>
          <p className="mt-2 text-sm text-muted">You need this to end the exam early. Do not share it with students.</p>
        </div>
      )}

      {/* ── START FORM ── */}
      {!examActive?.active && (
        <form onSubmit={handleStart} className="mt-6 rounded-2xl border border-surface-line bg-surface p-6 max-w-xl">
          <p className="font-display text-lg text-paper mb-4">Start a new exam</p>

          <label className="block mb-4">
            <span className="block text-xs uppercase tracking-wider text-muted mb-2">Duration (minutes)</span>
            <input type="number" min={5} max={300} value={duration} onChange={e => setDuration(Number(e.target.value))} className="input w-40"/>
          </label>

          <div className="mb-4">
            <span className="block text-xs uppercase tracking-wider text-muted mb-2">Allowed sites</span>
            <div className="flex gap-2">
              <input value={domainInput} onChange={e => setDomainInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addDomain(); } }}
                placeholder="e.g. moodle.neu.edu.tr" className="input"/>
              <button type="button" onClick={addDomain} className="shrink-0 rounded-lg bg-surface-raised px-3 py-2 text-sm text-paper hover:bg-surface-line">Add</button>
            </div>
            {domains.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {domains.map(d => (
                  <span key={d} className="flex items-center gap-1 rounded-lg border border-surface-line bg-surface-raised px-2 py-1 text-xs font-mono text-paper">
                    {d}
                    <button type="button" onClick={() => setDomains(prev => prev.filter(x => x !== d))} className="text-muted hover:text-red ml-1">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <label className="block mb-4">
            <span className="block text-xs uppercase tracking-wider text-muted mb-2">Your password</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input" placeholder="Master password"/>
          </label>

          {startError && <p className="mb-3 text-sm text-red">{startError}</p>}
          <button type="submit" disabled={starting} className="rounded-lg bg-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-dim disabled:opacity-50">
            {starting ? "Starting…" : "Start exam lockdown"}
          </button>
        </form>
      )}

      {/* ── ACTIVE EXAM DASHBOARD ── */}
      {examActive?.active && stats && (
        <div className="mt-6 space-y-4">

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div className="col-span-2 lg:col-span-1 rounded-2xl border border-blue/40 bg-blue/10 px-5 py-4">
              <p className="text-xs uppercase tracking-wider text-blue">Time remaining</p>
              <p className="mt-2 font-mono text-4xl tabular-nums text-paper">{fmt(remainingSeconds)}</p>
              <p className="mt-1 text-xs text-muted">{stats.duration_minutes} min total</p>
            </div>
            <div className="rounded-2xl border border-surface-line bg-surface px-5 py-4">
              <p className="text-xs uppercase tracking-wider text-muted">All violations</p>
              <p className={`mt-2 font-mono text-3xl tabular-nums ${stats.total_violations > 0 ? "text-red" : "text-paper"}`}>{stats.total_violations}</p>
            </div>
            <div className="rounded-2xl border border-surface-line bg-surface px-5 py-4">
              <p className="text-xs uppercase tracking-wider text-muted">Tab switches</p>
              <p className={`mt-2 font-mono text-3xl tabular-nums ${stats.tab_switches > 0 ? "text-gold" : "text-paper"}`}>{stats.tab_switches}</p>
            </div>
            <div className="rounded-2xl border border-surface-line bg-surface px-5 py-4">
              <p className="text-xs uppercase tracking-wider text-muted">Blocked sites</p>
              <p className={`mt-2 font-mono text-3xl tabular-nums ${stats.blocked_attempts > 0 ? "text-red" : "text-paper"}`}>{stats.blocked_attempts}</p>
            </div>
            {/* Extension removal card — highlighted prominently */}
            <div className={`rounded-2xl border px-5 py-4 ${stats.extension_removals > 0 ? "border-red/50 bg-red/10" : "border-surface-line bg-surface"}`}>
              <p className="text-xs uppercase tracking-wider text-muted">Ext. removed</p>
              <p className={`mt-2 font-mono text-3xl tabular-nums ${stats.extension_removals > 0 ? "text-red font-bold" : "text-paper"}`}>{stats.extension_removals}</p>
              {stats.extension_removals > 0 && <p className="mt-1 text-xs text-red">⚠ Cheating risk</p>}
            </div>
          </div>

          {/* Allowed sites */}
          <div className="rounded-2xl border border-surface-line bg-surface p-5">
            <p className="text-xs uppercase tracking-wider text-muted mb-2">Allowed sites</p>
            <div className="flex flex-wrap gap-2">
              {stats.allowed_domains.map(d => (
                <span key={d} className="rounded-lg border border-surface-line bg-surface-raised px-2 py-1 text-xs font-mono text-paper">✓ {d}</span>
              ))}
            </div>
          </div>

          {/* Violation log */}
          <div className="rounded-2xl border border-surface-line bg-surface p-5">
            <p className="font-display text-lg text-paper mb-3">
              Violation log
              <span className="ml-2 text-xs text-muted font-sans font-normal">auto-refreshes every 10s</span>
            </p>
            {stats.violations.length === 0 ? (
              <p className="text-sm text-muted">No violations recorded — all clear.</p>
            ) : (
              <div className="divide-y divide-surface-line">
                {stats.violations.map(v => {
                  const style = VIOLATION_STYLE[v.violation_type] ?? { label: v.violation_type, className: "bg-surface-raised text-muted" };
                  return (
                    <div key={v.id} className={`flex items-center justify-between py-2.5 ${v.violation_type === "extension_removed" ? "bg-red/5 px-2 rounded-lg" : ""}`}>
                      <div className="flex items-center gap-3">
                        <span className={`rounded px-2 py-0.5 text-xs ${style.className}`}>{style.label}</span>
                        <span className="font-mono text-xs text-muted">Student {v.client_id}</span>
                        {v.domain && <span className="text-xs text-paper">{v.domain}</span>}
                      </div>
                      <span className="text-xs text-muted">{timeAgo(v.timestamp)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* End exam */}
          <form onSubmit={handleEnd} className="rounded-2xl border border-red/30 bg-red/5 p-5">
            <p className="font-display text-lg text-red mb-1">End exam early</p>
            <p className="text-sm text-muted mb-4">Enter the supervisor code to end the exam for all students immediately.</p>
            <div className="flex gap-3 items-start">
              <input value={endCode} onChange={e => setEndCode(e.target.value)} placeholder="NEU-XXXX" className="input font-mono uppercase max-w-xs"/>
              <button type="submit" disabled={ending} className="shrink-0 rounded-lg bg-red px-4 py-2 text-sm font-medium text-white hover:bg-red-dim disabled:opacity-50">
                {ending ? "Ending…" : "End exam"}
              </button>
            </div>
            {endError && <p className="mt-2 text-sm text-red">{endError}</p>}
          </form>
        </div>
      )}
    </Layout>
  );
}