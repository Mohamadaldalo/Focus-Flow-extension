/**
 * extension/background.js  ← REPLACE your existing background.js
 *
 * Added: chrome.runtime.setUninstallURL + onSuspend detection
 * When the extension is removed or disabled during an active exam,
 * a violation is logged immediately to the backend.
 */

const API_BASE = "http://localhost:8000";
const ALARM_NAME = "focusflow-poll";

async function apiFetch(path, token = null) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch { return null; }
}

async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token ?? null;
}

function getClientId() {
  return new Promise(resolve => {
    chrome.storage.local.get("focusflow_client_id", ({ focusflow_client_id }) => {
      if (focusflow_client_id) { resolve(focusflow_client_id); return; }
      const id = crypto.randomUUID();
      chrome.storage.local.set({ focusflow_client_id: id });
      resolve(id);
    });
  });
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic", iconUrl: "icons/icon48.png",
    title, message, priority: 2,
  });
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

function formatBadge(seconds) {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h` : `${m}m`;
}

// ── Report a violation to the backend ────────────────────────────────────────
async function reportViolation(violationType, domain = null) {
  const clientId = await getClientId();
  try {
    await fetch(`${API_BASE}/exam/violation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, violation_type: violationType, domain }),
    });
  } catch { /* best-effort */ }
}

// ── Core poll ─────────────────────────────────────────────────────────────────
async function poll() {
  const token = await getToken();

  // 1. Exam mode check (public)
  const exam = await apiFetch("/exam/active");

  if (exam && exam.active) {
    const prev = (await chrome.storage.local.get("examActive")).examActive;
    await chrome.storage.local.set({
      examActive: true, examData: exam,
      sessionActive: false, allowedDomains: exam.allowed_domains ?? [],
      lastPoll: Date.now(),
    });
    setBadge(formatBadge(exam.remaining_seconds), "#C8102E");
    if (!prev) notify("FocusFlow — Exam started", `${exam.duration_minutes}-minute exam is now active.`);

    // Set uninstall URL so teacher sees the removal logged as a violation
    const clientId = await getClientId();
    chrome.runtime.setUninstallURL(
      `${API_BASE}/exam/uninstall-ping?client_id=${clientId}&exam_id=${exam.exam_id}`
    );
    return;
  }

  // Exam just ended — clear uninstall URL
  const wasExam = (await chrome.storage.local.get("examActive")).examActive;
  if (wasExam) {
    await chrome.storage.local.set({ examActive: false, examData: null });
    setBadge("", "#C8102E");
    chrome.runtime.setUninstallURL("");
    notify("FocusFlow — Exam ended", "The exam session has finished.");
  }

  // 2. Regular session
  const session = await apiFetch("/sessions/active", token);
  if (!session || session.status === "completed" || session.status === "cancelled") {
    const prev = (await chrome.storage.local.get("sessionActive")).sessionActive;
    if (prev) {
      await chrome.storage.local.set({ sessionActive: false, activeSession: null, allowedDomains: [] });
      setBadge("", "#4A8FE7");
      notify("FocusFlow — Session complete", "Great work — blocking is now off.");
    } else {
      await chrome.storage.local.set({ sessionActive: false, activeSession: null });
      setBadge("", "#4A8FE7");
    }
    chrome.runtime.setUninstallURL("");
    return;
  }

  const sites = await apiFetch("/allowlist", token);
  const allowedDomains = (sites ?? []).map(s => s.domain.toLowerCase());
  const prev = (await chrome.storage.local.get("sessionActive")).sessionActive;
  if (!prev) notify("FocusFlow — Session started", `${session.planned_duration_minutes}-min focus session is now active.`);

  const startMs = new Date(session.start_time + "Z").getTime();
  const remaining = session.planned_duration_minutes * 60 -
    (Date.now() - startMs) / 1000 - (session.paused_total_seconds ?? 0);
  setBadge(formatBadge(remaining), "#4A8FE7");

  await chrome.storage.local.set({
    sessionActive: true, examActive: false,
    activeSession: session, allowedDomains, lastPoll: Date.now(),
  });
}

// ── Extension suspend/disable detection ───────────────────────────────────────
// Fires when Chrome is about to terminate the service worker (including when
// the extension is disabled). We log a violation if an exam is active.
chrome.runtime.onSuspend.addListener(async () => {
  const { examActive, examData } = await chrome.storage.local.get(["examActive", "examData"]);
  if (!examActive || !examData) return;

  const clientId = await getClientId();

  // Fire-and-forget — we have very little time here
  navigator.sendBeacon(
    `${API_BASE}/exam/violation`,
    new Blob(
      [JSON.stringify({ client_id: clientId, violation_type: "extension_removed", domain: null })],
      { type: "application/json" }
    )
  );
});

// ── Alarms ────────────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM_NAME) poll(); });

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 10 / 60 });
}

// ── Messages ──────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CHECK_SESSION") {
    chrome.storage.local
      .get(["sessionActive", "activeSession", "allowedDomains", "examActive", "examData"])
      .then(sendResponse);
    return true;
  }
  if (message.type === "SET_TOKEN") {
    chrome.storage.local.set({ token: message.token }).then(() => { poll(); sendResponse({ ok: true }); });
    return true;
  }
  if (message.type === "LOGOUT") {
    chrome.storage.local
      .set({ token: null, sessionActive: false, activeSession: null, allowedDomains: [], examActive: false, examData: null })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "FORCE_POLL") {
    poll().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "REPORT_VIOLATION") {
    fetch(`${API_BASE}/exam/violation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload),
    }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

// ── Startup ───────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); poll(); });
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); poll(); });
poll();
ensureAlarm();