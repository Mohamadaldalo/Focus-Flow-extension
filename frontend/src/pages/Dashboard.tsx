import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { api } from "../api/client";
import { Layout } from "../components/Layout";
import { StatCard } from "../components/StatCard";
import type { FocusSession, Stats } from "../types";

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getStats(), api.getActiveSession()])
      .then(([s, session]) => { setStats(s); setActiveSession(session); })
      .finally(() => setLoading(false));
  }, []);

  const chartData =
    stats?.daily_breakdown.map((d) => ({
      day: new Date(d.date).toLocaleDateString(undefined, { weekday: "short" }),
      minutes: d.minutes,
    })) ?? [];

  return (
    <Layout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-paper">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Your focus, at a glance.</p>
        </div>
        <Link
          to="/session"
          className="rounded-lg bg-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-glow"
        >
          {activeSession ? "Go to active session" : "Start a focus session"}
        </Link>
      </div>

      {loading && <p className="mt-10 text-muted">Loading…</p>}

      {!loading && stats && (
        <>
          {activeSession && (
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-blue/30 bg-blue/10 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-blue">Session in progress</p>
                <p className="mt-1 text-sm text-paper">
                  {activeSession.planned_duration_minutes}-minute {activeSession.session_type.replace("_", " ")} · {activeSession.status}
                </p>
              </div>
              <Link to="/session" className="text-sm font-medium text-blue hover:text-blue-glow">
                View timer →
              </Link>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Today"              value={stats.today_focus_minutes}      unit="min" accent="blue" />
            <StatCard label="This week"          value={stats.week_focus_minutes}       unit="min" accent="blue" />
            <StatCard label="This month"         value={stats.month_focus_minutes}      unit="min" />
            <StatCard label="Current streak"     value={stats.current_streak_days}      unit="days" accent="gold" />
            <StatCard label="Sessions completed" value={stats.completed_sessions_count} />
            <StatCard label="Longest session"    value={stats.longest_session_minutes}  unit="min" />
          </div>

          <div className="mt-8 rounded-2xl border border-surface-line bg-surface p-6">
            <p className="font-display text-lg text-paper">Last 14 days</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="day" stroke="#7A90B5" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(74,143,231,0.08)" }}
                    contentStyle={{
                      background: "#1B2E52",
                      border: "1px solid #263D6B",
                      borderRadius: 8,
                      color: "#EEF2F9",
                    }}
                    labelStyle={{ color: "#7A90B5" }}
                  />
                  <Bar dataKey="minutes" fill="#4A8FE7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}