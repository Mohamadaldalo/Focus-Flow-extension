/**
 * src/components/OnlineTracker.tsx  ← NEW FILE
 *
 * Shows how many FocusFlow clients are currently online.
 * - Generates a persistent client UUID on first load (localStorage)
 * - Sends a heartbeat to POST /presence/heartbeat every 30 seconds
 * - Polls GET /presence/online every 30 seconds to get the live count
 * - A client is considered "online" if it pinged within the last 2 minutes
 */
import { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const INTERVAL_MS = 30_000; // 30 seconds

function getClientId(): string {
  let id = localStorage.getItem("focusflow_client_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("focusflow_client_id", id);
  }
  return id;
}

async function sendHeartbeat(clientId: string) {
  try {
    await fetch(`${API_BASE}/presence/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId }),
    });
  } catch {
    // silently ignore — network may be down briefly
  }
}

async function fetchCount(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/presence/online`);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

export function OnlineTracker() {
  const [count, setCount] = useState<number | null>(null);
  const clientId = useRef(getClientId());

  useEffect(() => {
    const tick = async () => {
      await sendHeartbeat(clientId.current);
      const c = await fetchCount();
      setCount(c);
    };

    // Run immediately on mount
    tick();

    // Then repeat every 30 seconds
    const interval = setInterval(tick, INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Dot colour: green if >0 confirmed online, grey while loading
  const dotColor =
    count === null ? "bg-muted" :
    count > 1      ? "bg-green-400" :
                     "bg-blue";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-surface-line bg-surface-raised px-3 py-2">
      {/* Pulsing dot */}
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dotColor}`}
        />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotColor}`} />
      </span>

      <span className="text-xs text-muted">
        {count === null ? (
          "Connecting…"
        ) : count === 1 ? (
          <><span className="font-medium text-paper">1</span> user online</>
        ) : (
          <><span className="font-medium text-paper">{count}</span> users online</>
        )}
      </span>
    </div>
  );
}
