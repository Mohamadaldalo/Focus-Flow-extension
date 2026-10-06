import { FormEvent, useEffect, useState } from "react";
import { api, ApiException } from "../api/client";
import { CooldownModal } from "../components/CooldownModal";
import { Layout } from "../components/Layout";
import type { FocusSession, Website } from "../types";

export default function AllowList() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("");
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [pendingDelete, setPendingDelete] = useState<Website | null>(null);
  const [pendingAdd, setPendingAdd] = useState(false);

  async function refresh() {
    const [sites, session] = await Promise.all([api.listWebsites(), api.getActiveSession()]);
    setWebsites(sites);
    setActiveSession(session);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      api.listWebsites(search).then(setWebsites);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const sessionLocked = activeSession?.status === "active" || activeSession?.status === "paused";

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!domain || !password) {
      setError("Domain and password are required.");
      return;
    }

    if (sessionLocked) {
      setPendingAdd(true);
      return;
    }

    try {
      await api.addWebsite(domain, label || undefined, password);
      setDomain("");
      setLabel("");
      setPassword("");
      refresh();
    } catch (e) {
      setError(e instanceof ApiException ? e.message : "Could not add site.");
    }
  }

  async function confirmAdd(pw: string, cooldownId: string) {
    await api.addWebsite(domain, label || undefined, pw, cooldownId);
    setDomain("");
    setLabel("");
    setPassword("");
    setPendingAdd(false);
    refresh();
  }

  async function handleDelete(site: Website, pw: string) {
    if (sessionLocked) {
      setPendingDelete(site);
      setPassword(pw);
      return;
    }
    await api.removeWebsite(site.id, pw);
    refresh();
  }

  async function confirmDelete(pw: string, cooldownId: string) {
    if (!pendingDelete) return;
    await api.removeWebsite(pendingDelete.id, pw, cooldownId);
    setPendingDelete(null);
    refresh();
  }

  return (
    <Layout>
      <h1 className="font-display text-3xl text-paper">Allow list</h1>
      <p className="mt-1 text-sm text-muted">
        Only these sites stay reachable during a focus session — everything else is blocked.
      </p>

      {sessionLocked && (
        <p className="mt-4 rounded-lg border border-amber/30 bg-amber/10 px-4 py-2 text-sm text-amber">
          A focus session is active, so editing the allow list requires a 60-second cooldown.
        </p>
      )}

      <form onSubmit={handleAdd} className="mt-6 rounded-2xl border border-surface-line bg-surface p-5">
        <p className="font-display text-lg text-paper">Add a site</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. docs.google.com"
            className="rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-amber sm:col-span-2"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-amber"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-amber"
          />
        </div>
        {error && <p className="mt-2 text-sm text-coral">{error}</p>}
        <button
          type="submit"
          className="mt-4 rounded-lg bg-amber px-4 py-2 text-sm font-medium text-ink hover:bg-amber-glow"
        >
          Add to allow list
        </button>
      </form>

      <div className="mt-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search allowed sites…"
          className="w-full max-w-sm rounded-lg border border-surface-line bg-surface px-3 py-2 text-sm text-paper outline-none focus:border-amber"
        />
      </div>

      <div className="mt-4 divide-y divide-surface-line rounded-2xl border border-surface-line bg-surface">
        {loading && <p className="px-5 py-4 text-sm text-muted">Loading…</p>}
        {!loading && websites.length === 0 && (
          <p className="px-5 py-4 text-sm text-muted">No sites yet — everything will be blocked during a session.</p>
        )}
        {websites.map((site) => (
          <WebsiteRow key={site.id} site={site} onDelete={handleDelete} />
        ))}
      </div>

      <CooldownModal
        open={pendingAdd}
        action="edit_allowlist"
        title={`Add ${domain} mid-session`}
        description="A focus session is currently running. Confirm you want to widen the allow list before it ends."
        confirmLabel="Add site"
        onCancel={() => setPendingAdd(false)}
        onConfirmed={confirmAdd}
      />

      <CooldownModal
        open={!!pendingDelete}
        action="edit_allowlist"
        title={`Remove ${pendingDelete?.domain ?? ""} mid-session`}
        description="A focus session is currently running. Confirm you want to remove this site before it ends."
        confirmLabel="Remove site"
        onCancel={() => setPendingDelete(null)}
        onConfirmed={confirmDelete}
      />
    </Layout>
  );
}

function WebsiteRow({ site, onDelete }: { site: Website; onDelete: (site: Website, password: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");

  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div>
        <p className="font-mono text-sm text-paper">{site.domain}</p>
        {site.label && <p className="text-xs text-muted">{site.label}</p>}
      </div>

      {!confirming ? (
        <button onClick={() => setConfirming(true)} className="text-sm text-muted hover:text-coral">
          Remove
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-32 rounded-lg border border-surface-line bg-ink px-2 py-1 text-sm text-paper outline-none focus:border-coral"
          />
          <button
            onClick={() => {
              onDelete(site, password);
              setConfirming(false);
              setPassword("");
            }}
            className="rounded-lg bg-coral px-3 py-1 text-sm font-medium text-ink hover:bg-coral-dim"
          >
            Confirm
          </button>
          <button onClick={() => setConfirming(false)} className="text-sm text-muted hover:text-paper">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
