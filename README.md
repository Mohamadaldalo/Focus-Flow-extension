# FocusFlow

> An allow-list productivity blocker built on the Pomodoro technique, with a supervised **Exam Mode** for universities.

Unlike a traditional website blocker (which blocks a few distracting sites), FocusFlow uses an **allow-list** approach: during a focus session, only the sites you explicitly approve remain reachable. Everything else is silently redirected to a focused, in-browser blocking page.

**Exam Mode** extends the same idea to a classroom. A supervisor locks every student's browser to a short list of approved sites for the length of an exam. Students identify themselves with their student ID, and every violation is logged against that ID on a live supervisor dashboard.

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────┐
│                     Chrome Extension                     │
│                                                          │
│  background.js  ──poll every 10s──►  FastAPI backend     │
│                   /exam/active (public) checked first,   │
│                   then /sessions/active                  │
│  content.js     ──check storage──►  chrome.storage       │
│                   redirects blocked pages, reports       │
│                   violations during an exam              │
│  popup.js       ──login / student ID / status──►         │
│                   chrome.storage                         │
│  blocked.html   (redirected to when a site is blocked)   │
└──────────────────────────────────────────────────────────┘
                           │
               HTTP (localhost:8000)
                           │
┌──────────────────────────────────────────────────────────┐
│               FastAPI Backend  (Python 3.12)             │
│                                                          │
│  /auth          — setup, login, password change          │
│  /allowlist     — CRUD allow-list entries                │
│  /sessions      — start, pause, resume, complete,        │
│                   stop (with cooldown)                   │
│  /cooldown      — 60-second cooldown protection flow     │
│  /settings      — Pomodoro timer config                  │
│  /stats         — daily/weekly/monthly focus stats       │
│  /presence      — heartbeat + live "users online" count  │
│  /exam          — exam lockdown, violations, supervisor  │
│                   dashboard data                         │
│                                                          │
│  SQLite (focusflow.db)  via SQLAlchemy ORM               │
└──────────────────────────────────────────────────────────┘
                           │
               HTTP (localhost:5173)
                           │
┌──────────────────────────────────────────────────────────┐
│             React + TypeScript + Tailwind CSS            │
│                                                          │
│  /            — Dashboard (stats + activity chart)       │
│  /session     — Live Pomodoro timer (ApertureTimer)      │
│  /allowlist   — Allow-list management                    │
│  /exam        — Supervisor exam control + live dashboard │
│  /settings    — Timer durations + notifications          │
│  /login       — First-run setup + login                  │
└──────────────────────────────────────────────────────────┘


## Key features

| Feature | Detail |
|---|---|
| Allow-list blocking | Only approved domains are reachable mid-session |
| Cooldown protection | Stopping a session or editing the allow list mid-session requires your password + a 60-second mandatory wait |
| Aperture timer | Signature camera-iris SVG countdown — the iris closes as the session progresses |
| Stats dashboard | 14-day focus chart, streaks, longest session, session count |
| **Exam Mode** | Supervisor-controlled lockdown with a fixed duration, an allowed-site list, and a supervisor code to end it early |
| **Student ID tracking** | Students enter their ID in the extension; every violation is tagged with it |
| **Violation logging** | Blocked-site attempts, tab switches, and extension uninstall, shown live to the supervisor |
| **Per-student summary** | Supervisor dashboard groups violations by student, worst first |
| Single local account | bcrypt-hashed password, JWT bearer tokens — no external auth service |
| Password-protected logout | The master password is required to log out of the web app |
| Dark / light theme | Light mode uses Near East University colours |
| Chrome Extension MV3 | Service worker polls API, content script redirects blocked pages before they render |

---

## Exam Mode

Exam Mode lets one supervisor lock a room of students to approved sites and see exactly what each student tried to do.

### How it works

**Supervisor (web app at `/exam`)**

1. Sets the exam duration and the allowed sites (for example `moodle.neu.edu.tr`) and enters the master password
2. Receives a one-time **supervisor code** such as `NEU-7A2F`. Keep it private: it is the only way to end the exam early
3. Watches the live dashboard, which refreshes every 10 seconds:
   - Time remaining
   - Totals for all violations, tab switches, blocked sites and extension removals
   - **Per-student summary** table sorted by number of violations
   - **Full violation log** with student ID, type, site and time

**Student (Chrome extension only, no web app needed)**

1. Within about 10 seconds of the exam starting, the extension detects it automatically. The toolbar badge turns red and shows the remaining minutes
2. The popup asks for a **student ID** (6 to 12 digits). It is stored locally and attached to every violation
3. The popup then shows a locked view: countdown timer and allowed sites, with no controls to stop the exam
4. Visiting any site not on the list redirects to the blocking page, which warns that the attempt has been logged
5. Switching tabs is logged as a violation

**Ending the exam**

- Automatically when the timer reaches zero. Student extensions unlock on their next poll
- Early, when the supervisor enters the supervisor code on the dashboard

### Violation types

| Type | Logged when |
|---|---|
| `blocked_site` | A student opens a site that is not on the allow list |
| `tab_switch` | A page becomes hidden (the student switches tab or window) |
| `extension_removed` | The extension is uninstalled, via Chrome's uninstall URL |

Exam Mode takes priority over a personal focus session. While an exam is active, the extension enforces the exam's allow list instead.

### Running an exam in a classroom

By default the extension talks to `http://localhost:8000`, which only works on the supervisor's own machine. For a real classroom:

1. Run the backend on the supervisor's computer, listening on the network:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
2. Find that computer's LAN IP (`ipconfig` on Windows, for example `192.168.1.45`) and allow port 8000 through the firewall
3. In `extension/background.js` and `extension/popup/popup.js`, change `API_BASE` to `http://192.168.1.45:8000`
4. Have students load the `extension/` folder as an unpacked extension (see the Chrome Extension setup below). Students do not need the web app

Alternatively, deploy the backend to a hosted server and use its URL as `API_BASE`.

---

## Database schema

| Table | Purpose |
|---|---|
| `users` | Single-user installation record + bcrypt password hash |
| `user_settings` | Pomodoro durations, notification prefs, cooldown length |
| `allowed_websites` | Domain + optional friendly label |
| `focus_sessions` | Session records with type, status, start/end, paused time |
| `cooldown_requests` | One-time, time-gated tokens required to perform sensitive actions |
| `online_presence` | Browser client IDs and last-seen time, for the "users online" count |
| `exam_sessions` | Exam duration, allowed domains (JSON), status, start/end time, supervisor code |
| `exam_violations` | One row per violation: exam, client ID, student ID, type, domain, timestamp |

---

## API documentation

The full OpenAPI spec is served at **http://localhost:8000/docs** once the backend is running.

### Key endpoints

```
GET  /auth/status                 → { initialized: bool }
POST /auth/setup                  → { access_token }     (first run only)
POST /auth/login                  → { access_token }
POST /auth/change-password        → 204

GET  /allowlist                   → Website[]
POST /allowlist                   → Website              (requires password; cooldown if session active)
DELETE /allowlist/{id}            → 204                  (requires password; cooldown if session active)

GET  /sessions/active             → FocusSession | null
GET  /sessions                    → FocusSession[]
POST /sessions/start              → FocusSession
POST /sessions/{id}/pause         → FocusSession
POST /sessions/{id}/resume        → FocusSession
POST /sessions/{id}/complete      → FocusSession         (natural timer end)
POST /sessions/{id}/stop          → FocusSession         (requires password + cooldown_id)

POST /cooldown/initiate           → CooldownStatus       (requires password)
GET  /cooldown/{id}               → CooldownStatus

GET  /settings                    → UserSettings
PUT  /settings                    → UserSettings         (requires password)

GET  /stats                       → Stats

POST /presence/heartbeat          → 204                  (public; client_id only)
GET  /presence/online             → { count, client_ids } (public)
```

### Exam endpoints

```
POST /exam/start                  → { exam_id, supervisor_code, ... }   (JWT + master password)
GET  /exam/active                 → { active, duration_minutes,         (public; polled by extension)
                                      allowed_domains, remaining_seconds }
POST /exam/violation              → 204                                 (public; client_id + student_id)
GET  /exam/uninstall-ping         → { logged }                          (public; opened by Chrome on uninstall)
GET  /exam/stats                  → totals, violations, student_summary (JWT)
POST /exam/end                    → 204                                 (JWT + supervisor code)
```

`/exam/active`, `/exam/violation` and `/exam/uninstall-ping` are public because student machines do not hold the supervisor's token. See the limitations below.

---

## Security model

- Passwords are hashed with **bcrypt** (cost factor 12). The plain-text password is never stored or logged.
- A **JWT bearer token** (HS256, 12-hour expiry) is issued on login and required for all authenticated endpoints.
- **Sensitive actions** (stopping a session, editing the allow list mid-session) require both the master password *and* a confirmed **60-second cooldown**. This prevents impulsive bypass.
- **Logging out** of the web app requires the master password.
- **Exam control** is supervisor-only: starting an exam needs the JWT plus the master password, and ending one early needs the JWT plus the supervisor code. No student-facing endpoint can stop an exam.
- Input validation on all endpoints via Pydantic v2. Domain names are normalised to lowercase, strip `www.` and trailing paths.

### Exam Mode limitations

- **Violation reporting is unauthenticated.** Anyone who can reach the backend can post a violation. Treat the log as evidence to review, not as proof.
- **Student IDs are self-entered** and not checked against a university database.
- **Extension removal is detected, not prevented.** Chrome does not let an extension block its own uninstall. FocusFlow logs the removal through the uninstall URL. Disabling the extension (as opposed to uninstalling it) is not reliably detected, and once the extension is gone, blocking stops.
- **Tab switches are a signal, not a verdict.** A violation is logged whenever a page becomes hidden, including switches between allowed tabs.
- The supervisor code is stored in plain text in the local SQLite database.
- Enforcement runs in the student's own browser, so it only covers Chrome with the extension installed. It is not a replacement for in-person invigilation.

---

## Project structure

```
focusflow/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, CORS, route registration
│   │   ├── config.py         # Pydantic settings (env vars / .env)
│   │   ├── database.py       # SQLAlchemy engine + session dep
│   │   ├── models.py         # ORM models (User, AllowedWebsite, FocusSession,
│   │   │                     #   ExamSession, ExamViolation, OnlinePresence, …)
│   │   ├── schemas.py        # Pydantic request/response models
│   │   ├── security.py       # bcrypt + JWT helpers
│   │   ├── deps.py           # FastAPI auth dependency
│   │   ├── cooldown.py       # 60-second cooldown logic
│   │   └── routers/
│   │       ├── auth.py
│   │       ├── allowlist.py
│   │       ├── sessions.py
│   │       ├── cooldown.py
│   │       ├── settings.py
│   │       ├── stats.py
│   │       ├── presence.py   # heartbeat + online count
│   │       └── exam.py       # exam lockdown, violations, supervisor stats
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.css         # Tailwind + dark/light CSS variables + .input utility
│   │   ├── vite-env.d.ts
│   │   ├── api/client.ts     # Typed fetch wrapper + token management
│   │   ├── types/index.ts    # Shared TypeScript types
│   │   ├── context/
│   │   │   ├── AuthContext.tsx
│   │   │   └── ThemeContext.tsx    # dark / light mode
│   │   ├── components/
│   │   │   ├── ApertureTimer.tsx   # Signature camera-iris SVG timer
│   │   │   ├── CooldownModal.tsx   # 60-second cooldown UX flow
│   │   │   ├── Layout.tsx          # Sidebar nav, theme toggle, password logout
│   │   │   ├── Logo.tsx
│   │   │   ├── OnlineTracker.tsx   # live "users online" indicator
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── StatCard.tsx
│   │   └── pages/
│   │       ├── Login.tsx
│   │       ├── Dashboard.tsx
│   │       ├── Session.tsx
│   │       ├── AllowList.tsx
│   │       ├── ExamControl.tsx     # supervisor exam start + live dashboard
│   │       └── Settings.tsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── .env.example
│
└── extension/
    ├── manifest.json         # MV3 manifest
    ├── background.js         # Service worker: polling, exam/session state,
    │                         #   notifications, toolbar badge, uninstall URL
    ├── content.js            # document_start redirect + exam violation reporting
    ├── icons/
    │   ├── icon16.png
    │   ├── icon32.png
    │   ├── icon48.png
    │   └── icon128.png
    ├── popup/
    │   ├── popup.html        # login / student ID / locked exam / session views
    │   ├── popup.css
    │   └── popup.js
    └── blocked/
        └── blocked.html      # Blocking page with live timer (exam and focus variants)
```

---

## Setup guide

### Prerequisites

- **Python 3.12+**
- **Node.js 18+** (npm included)
- **Google Chrome** (or any Chromium browser)
- **Git** (optional)

---

### 1 — Backend

```bash
cd focusflow/backend

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# (Optional) copy env file and adjust if needed
cp .env.example .env

# Start the API server
uvicorn app.main:app --reload --port 8000
```

The API is now running at **http://localhost:8000**.  
Interactive docs: **http://localhost:8000/docs**

The SQLite database (`focusflow.db`) and all tables, including the exam tables, are created automatically on first start. If you add the exam feature to an existing install, restart the backend so the new tables are created.

---

### 2 — Frontend

In a second terminal:

```bash
cd focusflow/frontend

# Install dependencies
npm install

# Copy and configure the API URL (default already points to localhost:8000)
cp .env.example .env

# Start the dev server
npm run dev
```

Open **http://localhost:5173** in Chrome.  
You'll be prompted to create your master password on first launch.

To build for production:
```bash
npm run build          # output goes to dist/
npm run preview        # serve the production build locally
```

---

### 3 — Chrome Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `focusflow/extension/` folder
5. The FocusFlow icon appears in your toolbar

**For personal focus sessions:**

1. Click the FocusFlow toolbar icon
2. Enter your master password (the same one you created in the web app)
3. The extension logs in and begins polling the backend

**For exams:** students do not log in. When the supervisor starts an exam, the extension detects it automatically and the popup asks for a student ID.

The extension will:
- Intercept every page load while a session or exam is active
- Allow only domains on the allow list
- Redirect everything else to the blocking page
- Show the remaining time in the popup and on the toolbar badge
- Send desktop notifications when sessions and exams start and end

> **Note:** The extension communicates with the backend at `http://localhost:8000`.  
> Both the backend and extension must be running simultaneously for blocking to work. After editing extension files, click the refresh icon on its card in `chrome://extensions`. There is no need to re-upload anything.

---

### 4 — Full development workflow

```bash
# Terminal 1 — backend
cd focusflow/backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd focusflow/frontend
npm run dev

# Chrome extension — loaded once from chrome://extensions
# (click the refresh icon after changing extension files)
```

---

## Customising the cooldown duration

The default cooldown is **60 seconds**. To change it, edit `.env`:

```
# backend/.env
COOLDOWN_SECONDS=120   # 2-minute cooldown
```

---

## Common issues

| Problem | Solution |
|---|---|
| `Connection refused` on login | Make sure the backend is running (`uvicorn app.main:app --port 8000`) |
| Extension shows no session | Click the icon, log in with your password, then start a session in the web app |
| Sites not being blocked | Confirm a session or exam is active; reload the extension from `chrome://extensions` if needed |
| Fonts not loading in extension popup | The popup fetches Google Fonts — requires an internet connection |
| `409 Conflict` on setup | An account already exists; use the login endpoint instead |
| Blank page at `/exam` | `App.tsx` is missing the `/exam` route, or `pages/ExamControl.tsx` does not exist |
| `Table 'exam_sessions' is already defined` | The exam model classes are in `models.py` twice. Keep only one copy |
| Students' extensions never enter exam mode | The student machine cannot reach the backend. Check `API_BASE`, the supervisor's LAN IP, and the firewall |
| `409 Conflict` on exam start | An exam is already active. End it with the supervisor code or wait for it to expire |

---

## Design decisions

**Why allow-list instead of block-list?** A block-list requires you to predict every distraction in advance and is trivially defeated by visiting a site you forgot to add. An allow-list inverts the burden: you consciously choose what you *need*, and everything else is blocked by default.

**Why a 60-second cooldown instead of just a password?** A password can be entered impulsively in under five seconds. The cooldown introduces enough friction that the urge to quit usually passes before the timer does. The password *and* cooldown together make stopping feel like a deliberate choice rather than a reflex.

**Why a content-script redirect over declarativeNetRequest?** Dynamic DNR rule updates require writing and removing rule sets on session start/stop, which has edge cases around rule ID management and quota limits. The content-script approach (`document_start` + `location.replace`) is simpler, reliable, and works without persistent rule storage.

**Why does Exam Mode use a separate supervisor code instead of the master password?** Students never see the web app, but the supervisor code lets the exam be ended without exposing the account password on a shared screen, and it is generated per exam so it cannot be reused.

**Why is `/exam/active` public?** Student machines have no login. The extension only needs the exam's duration and allowed sites, so that endpoint exposes nothing beyond that. The trade-off is the unauthenticated violation endpoint described in the limitations above.

**Why poll instead of push?** A Manifest V3 service worker is short-lived and cannot hold a persistent connection. A Chrome alarm that polls every 10 seconds survives service-worker restarts, at the cost of up to a 10-second delay before an exam starts or ends on a student machine.
