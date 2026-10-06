/**
 * extension/popup/popup.js  ← REPLACE your existing popup.js
 *
 * Changes:
 *   - Exam mode: shows a locked view with timer, violation count, no controls
 *   - Regular session: unchanged
 *   - Idle: login or "open app" as before
 */

const API_BASE = "http://localhost:8000";
let tickInterval = null;

function $(id) { return document.getElementById(id); }
function show(el) { el.style.display = ""; }
function hide(el) { el.style.display = "none"; }

function fmt(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

function computeRemaining(session, nowMs) {
  const startMs = new Date(session.start_time + "Z").getTime();
  const referenceNow =
    session.status === "paused" && session.paused_at
      ? new Date(session.paused_at + "Z").getTime()
      : nowMs;
  const elapsed = (referenceNow - startMs) / 1000 - (session.paused_total_seconds ?? 0);
  return Math.max(0, session.planned_duration_minutes * 60 - elapsed);
}

// ── Views ─────────────────────────────────────────────────────────────────────
function showLoginView() {
  hide($("examView"));
  hide($("sessionView"));
  show($("loginView"));
}

function showExamView(examData) {
  hide($("loginView"));
  hide($("sessionView"));
  show($("examView"));

  if (!examData) return;

  // Countdown using remainingSeconds from server, counting down locally
  let remaining = examData.remaining_seconds ?? 0;
  const startTs = Date.now();

  if (tickInterval) clearInterval(tickInterval);
  function tick() {
    const elapsed = (Date.now() - startTs) / 1000;
    const current = Math.max(0, remaining - elapsed);
    $("examTime").textContent = fmt(current);

    // Progress ring
    const CIRC = 2 * Math.PI * 44;
    const total = (examData.duration_minutes ?? 1) * 60;
    const progress = total > 0 ? (total - current) / total : 0;
    $("examArc").style.strokeDashoffset = CIRC * (1 - progress);
  }
  tick();
  tickInterval = setInterval(tick, 1000);

  // Allowed domains list
  const ul = $("examAllowedList");
  ul.innerHTML = "";
  (examData.allowed_domains ?? []).forEach(d => {
    const li = document.createElement("li");
    li.textContent = d;
    ul.appendChild(li);
  });
}

function showSessionView(state) {
  hide($("loginView"));
  hide($("examView"));
  show($("sessionView"));

  if (state?.sessionActive && state.activeSession) {
    show($("activeBlock"));
    hide($("idleBlock"));

    if (tickInterval) clearInterval(tickInterval);
    function tick() {
      $("popupTime").textContent = fmt(computeRemaining(state.activeSession, Date.now()));
    }
    tick();
    tickInterval = setInterval(tick, 1000);

    const ul = $("allowlistItems");
    ul.innerHTML = "";
    (state.allowedDomains ?? []).forEach(domain => {
      const li = document.createElement("li");
      li.textContent = domain;
      ul.appendChild(li);
    });
    if ((state.allowedDomains ?? []).length === 0) {
      const li = document.createElement("li");
      li.style.color = "#7A90B5";
      li.textContent = "No sites allowed (all blocked)";
      ul.appendChild(li);
    }
  } else {
    hide($("activeBlock"));
    show($("idleBlock"));
    if (tickInterval) clearInterval(tickInterval);
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? "Login failed");
  }
  const { access_token } = await res.json();
  await chrome.storage.local.set({ token: access_token });
  await chrome.runtime.sendMessage({ type: "SET_TOKEN", token: access_token });
  return access_token;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const { token } = await chrome.storage.local.get("token");
  const state = await chrome.runtime.sendMessage({ type: "CHECK_SESSION" });

  // Exam mode takes priority — shown even without login
  if (state?.examActive && state.examData) {
    showExamView(state.examData);
    return;
  }

  if (!token) { showLoginView(); return; }

  showSessionView(state);
}

// ── Events ────────────────────────────────────────────────────────────────────
$("loginBtn").addEventListener("click", async () => {
  const password = $("passwordInput").value.trim();
  if (!password) return;
  $("loginBtn").disabled = true;
  $("loginBtn").textContent = "Logging in…";
  hide($("loginError"));
  try {
    await login(password);
    const state = await chrome.runtime.sendMessage({ type: "CHECK_SESSION" });
    showSessionView(state);
  } catch (err) {
    $("loginError").textContent = err.message;
    show($("loginError"));
  } finally {
    $("loginBtn").disabled = false;
    $("loginBtn").textContent = "Log in";
  }
});

$("passwordInput").addEventListener("keydown", e => {
  if (e.key === "Enter") $("loginBtn").click();
});

$("logoutBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "LOGOUT" });
  if (tickInterval) clearInterval(tickInterval);
  showLoginView();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    chrome.runtime.sendMessage({ type: "FORCE_POLL" }).then(() => {
      chrome.runtime.sendMessage({ type: "CHECK_SESSION" }).then(state => {
        if (state?.examActive && state.examData) { showExamView(state.examData); return; }
        chrome.storage.local.get("token").then(({ token }) => {
          if (!token) showLoginView();
          else showSessionView(state);
        });
      });
    });
  }
});

init();