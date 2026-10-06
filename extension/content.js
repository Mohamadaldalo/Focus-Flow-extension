(async function () {
  const hostname = location.hostname;
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || location.protocol === "chrome-extension:") return;

  let state;
  try { state = await chrome.runtime.sendMessage({ type: "CHECK_SESSION" }); } catch { return; }

  const isExam    = state?.examActive;
  const isSession = state?.sessionActive && !isExam;
  if (!isExam && !isSession) return;

  const allowedDomains = state.allowedDomains ?? [];

  function isAllowed(hostname, allowedDomains) {
    const h = hostname.toLowerCase().replace(/^www\./, "");
    return allowedDomains.some(d => { const a = d.toLowerCase().replace(/^www\./, ""); return h === a || h.endsWith("." + a); });
  }

  const clientId = (() => {
    let id = localStorage.getItem("focusflow_client_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("focusflow_client_id", id); }
    return id;
  })();

  // Tab switch detection — exam only
  if (isExam && !document._focusflowTabListener) {
    document._focusflowTabListener = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        chrome.runtime.sendMessage({ type: "REPORT_VIOLATION", payload: { client_id: clientId, violation_type: "tab_switch", domain: null } });
      }
    });
  }

  if (isAllowed(hostname, allowedDomains)) return;

  // Report blocked attempt during exam
  if (isExam) {
    chrome.runtime.sendMessage({ type: "REPORT_VIOLATION", payload: { client_id: clientId, violation_type: "blocked_site", domain: hostname } });
  }

  const blockedUrl = chrome.runtime.getURL("blocked/blocked.html");
  const exam = state.examData;
  const session = state.activeSession;

  const params = new URLSearchParams({
    attempted:        location.href,
    isExam:           isExam ? "1" : "0",
    plannedMinutes:   exam ? String(exam.duration_minutes) : String(session?.planned_duration_minutes ?? 0),
    startTime:        exam ? (exam.start_time ?? "") : (session?.start_time ?? ""),
    pausedSeconds:    exam ? "0" : String(session?.paused_total_seconds ?? 0),
    status:           exam ? "active" : (session?.status ?? "active"),
    remainingSeconds: exam ? String(exam.remaining_seconds ?? 0) : "0",
  });

  location.replace(`${blockedUrl}?${params.toString()}`);
})();