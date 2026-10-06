# FocusFlow

> An allow-list productivity blocker built on the Pomodoro technique.

Unlike a traditional website blocker (which blocks a few distracting sites), FocusFlow uses an **allow-list** approach: during a focus session, only the sites you explicitly approve remain reachable. Everything else is silently redirected to a focused, in-browser blocking page.

---

## Architecture overview

```
┌──────────────────────────────────────────────────────┐
│                    Chrome Extension                   │
│                                                      │
│  background.js  ──poll every 10s──►  FastAPI backend │
│  content.js     ──check storage──►  chrome.storage   │
│  popup.js       ──login/status──►   chrome.storage   │
│  blocked.html   (redirected to when a site is blocked)│
└──────────────────────────────────────────────────────┘
                          │
              HTTP (localhost:8000)
                          │
┌──────────────────────────────────────────────────────┐
│              FastAPI Backend  (Python 3.12)           │
│                                                      │
│  /auth          — setup, login, password change      │
│  /allowlist     — CRUD allow-list entries            │
│  /sessions      — start, pause, resume, complete,    │
│                   stop (with cooldown)               │
│  /cooldown      — 60-second cooldown protection flow │
│  /settings      — Pomodoro timer config              │
│  /stats         — daily/weekly/monthly focus stats   │
│                                                      │
│  SQLite (focusflow.db)  via SQLAlchemy ORM           │
└──────────────────────────────────────────────────────┘
                          │
              HTTP (localhost:5173)
                          │
┌──────────────────────────────────────────────────────┐
│            React + TypeScript + Tailwind CSS         │
│                                                      │
│  /            — Dashboard (stats + activity chart)   │
│  /session     — Live Pomodoro timer (ApertureTimer)  │
│  /allowlist   — Allow-list management                │
│  /settings    — Timer durations + notifications      │
│  /login       — First-run setup + login              │
└──────────────────────────────────────────────────────┘
```

---

## Key features

| Feature | Detail |
|---|---|
| Allow-list blocking | Only approved domains are reachable mid-session |
| Cooldown protection | Stopping a session or editing the allow list mid-session requires your password + a 60-second mandatory wait |
| Aperture timer | Signature camera-iris SVG countdown — the iris closes as the session progresses |
| Stats dashboard | 14-day focus chart, streaks, longest session, session count |
| Single local account | bcrypt-hashed password, JWT bearer tokens — no external auth service |
| Chrome Extension MV3 | Service worker polls API, content script redirects blocked pages before they render |

---

## Database schema

| Table | Purpose |
|---|---|
| `users` | Single-user installation record + bcrypt password hash |
| `user_settings` | Pomodoro durations, notification prefs, cooldown length |
| `allowed_websites` | Domain + optional friendly label |
| `focus_sessions` | Session records with type, status, start/end, paused time |
| `cooldown_requests` | One-time, time-gated tokens required to perform sensitive actions |

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
```

---

## Security model

- Passwords are hashed with **bcrypt** (cost factor 12). The plain-text password is never stored or logged.
- A **JWT bearer token** (HS256, 12-hour expiry) is issued on login and required for all authenticated endpoints.
- **Sensitive actions** (stopping a session, editing the allow list mid-session) require both the master password *and* a confirmed **60-second cooldown**. This prevents impulsive bypass.
- Input validation on all endpoints via Pydantic v2. Domain names are normalised to lowercase, strip `www.` and trailing paths.

---

## Project structure

```
focusflow/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, CORS, route registration
│   │   ├── config.py         # Pydantic settings (env vars / .env)
│   │   ├── database.py       # SQLAlchemy engine + session dep
│   │   ├── models.py         # ORM models (User, AllowedWebsite, FocusSession, …)
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
│   │       └── stats.py
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.css         # Tailwind + design tokens + .input utility
│   │   ├── vite-env.d.ts
│   │   ├── api/client.ts     # Typed fetch wrapper + token management
│   │   ├── types/index.ts    # Shared TypeScript types
│   │   ├── context/
│   │   │   └── AuthContext.tsx
│   │   ├── components/
│   │   │   ├── ApertureTimer.tsx   # Signature camera-iris SVG timer
│   │   │   ├── CooldownModal.tsx   # 60-second cooldown UX flow
│   │   │   ├── Layout.tsx          # Sidebar nav + main content wrapper
│   │   │   ├── Logo.tsx
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── StatCard.tsx
│   │   └── pages/
│   │       ├── Login.tsx
│   │       ├── Dashboard.tsx
│   │       ├── Session.tsx
│   │       ├── AllowList.tsx
│   │       └── Settings.tsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── .env.example
│
└── extension/
    ├── manifest.json         # MV3 manifest
    ├── background.js         # Service worker: polling, state, notifications
    ├── content.js            # document_start redirect for blocked sites
    ├── icons/
    │   ├── icon16.png
    │   ├── icon32.png
    │   ├── icon48.png
    │   └── icon128.png
    ├── popup/
    │   ├── popup.html
    │   ├── popup.css
    │   └── popup.js
    └── blocked/
        └── blocked.html      # Full-screen blocking page with live timer
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

The SQLite database (`focusflow.db`) is created automatically on first start.

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

**After loading the extension:**

1. Click the FocusFlow toolbar icon
2. Enter your master password (the same one you created in the web app)
3. The extension logs in and begins polling the backend

The extension will now:
- Intercept every page load while a session is active
- Allow only domains on your allow list
- Redirect everything else to the blocking page
- Show the remaining time in the popup
- Send desktop notifications when sessions start and end

> **Note:** The extension communicates with the backend at `http://localhost:8000`.  
> Both the backend and extension must be running simultaneously for blocking to work.

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
# (auto-reloads are not required; the service worker is stateless)
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
| Sites not being blocked | Confirm a session is active in the web app; reload the extension from `chrome://extensions` if needed |
| Fonts not loading in extension popup | The popup fetches Google Fonts — requires an internet connection |
| `409 Conflict` on setup | An account already exists; use the login endpoint instead |

---

## Design decisions

**Why allow-list instead of block-list?** A block-list requires you to predict every distraction in advance and is trivially defeated by visiting a site you forgot to add. An allow-list inverts the burden: you consciously choose what you *need*, and everything else is blocked by default.

**Why a 60-second cooldown instead of just a password?** A password can be entered impulsively in under five seconds. The cooldown introduces enough friction that the urge to quit usually passes before the timer does. The password *and* cooldown together make stopping feel like a deliberate choice rather than a reflex.

**Why a content-script redirect over declarativeNetRequest?** Dynamic DNR rule updates require writing and removing rule sets on session start/stop, which has edge cases around rule ID management and quota limits. The content-script approach (`document_start` + `location.replace`) is simpler, reliable, and works without persistent rule storage.
