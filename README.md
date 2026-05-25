# Scheduling Agent

A research platform exploring how well a Gemini-driven agent can reflect a participant's scheduling preferences after seeing (a) their survey answers and (b) a set of scheduling scenarios.

## Flow

1. Participant signs in with Google (read-only Calendar scope included).
2. They upload two PDFs: their **survey answers** and the session's **scheduling scenarios**. Both are sent to Gemini — one produces a markdown profile, the other extracts a structured list of scenarios.
3. The workspace shows a weekly calendar (Monday-first) on the left and the current scenario on the right. The calendar pulls events from Google. The user can add manual events.
4. For each scenario the participant drags an option card onto the calendar, writes their reasoning, then submits. Gemini proposes its own time and reasoning, which appears on the calendar. The user accepts or critiques the proposal with optional feedback.
5. After every scenario is answered, the participant downloads a structured JSON log of the session.

## Tech

- **Frontend** — Vite, React 19, TypeScript, react-router, @tanstack/react-query, react-big-calendar (with HTML5 drag from outside), date-fns. Dev port `5174`.
- **Backend** — Node 22, Express, TypeScript, better-sqlite3, cookie-session, multer, @google/generative-ai, googleapis. Dev port `3001`.
- **Storage** — SQLite (sessions, scenarios, events, answers) + filesystem for uploaded PDFs and the per-session profile markdown, all under `DATA_DIR` (defaults to `./data`).
- **Auth** — Google OAuth (`openid` + `email` + `profile` + `calendar.readonly`). A second optional Microsoft OAuth flow for Outlook will land later.
- **LLM** — Gemini (default `gemini-2.0-flash-exp`). PDFs are sent inline; structured outputs come back via `responseMimeType: application/json`.

## Why does Google warn me when I sign in?

While the study runs with named participants, the Google OAuth client stays in **Testing** mode. That mode shows the standard *"Google hasn't verified this app"* warning the first time each tester signs in — click **Advanced → Continue**. It is expected and safe for participants who are on your test-user list.

Add each participant's Google address at https://console.cloud.google.com/apis/credentials/consent under **Test users** (up to 100). Refresh tokens for testers expire after 7 days; participants whose session spans a longer gap will need to sign in again.

Sign-in itself only asks for the basic Google profile. Sharing Google Calendar events is opt-in via a second prompt inside the app, where the participant can also choose to anonymize event titles as `"Busy"`.

## Setup

```bash
# install everything once
npm run install:all

# create your env (see template)
cp backend/.env.example backend/.env
# fill in GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET
```

### Google OAuth credentials

In the Google Cloud Console, create an OAuth 2.0 client of type **Web application**. For local dev:

- Authorized JavaScript origin: `http://localhost:5174`
- Authorized redirect URI: `http://localhost:5174/api/auth/google/callback`

For production behind Dockploy, use your real domain and set `GOOGLE_REDIRECT_URI` + `PUBLIC_URL` accordingly.

Enable the **Google Calendar API** for the project and add scope `https://www.googleapis.com/auth/calendar.readonly` to the OAuth consent screen.

## Run (dev)

```bash
npm run dev
```

Frontend at <http://localhost:5174>, backend at <http://localhost:3001>. The Vite dev server proxies `/api/*` to the backend, so the OAuth callback URL above resolves correctly through the proxy.

## Build & serve (production-ish)

```bash
# build both packages
npm run build --workspaces  # or build each directly

# run the unified server (Express serves both /api and the built SPA)
PUBLIC_DIR=$(pwd)/frontend/dist npm start --prefix backend
```

## Docker / Dockploy

```bash
# local
docker compose up --build

# Dockploy: point at this repo, use the Dockerfile, mount /data as a persistent volume,
# and supply env vars (GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
# SESSION_SECRET, PUBLIC_URL, GOOGLE_REDIRECT_URI). Expose port 3001.
```

The container serves both the API and the built SPA on the same port. SQLite, uploaded PDFs, and generated profile markdown all live under `/data`, which is mounted as a named volume so redeploys do not lose participant data.

## Directory map

```
Scheduling Agent/
├── Dockerfile                 # multi-stage: build frontend + backend, serve both from Express
├── docker-compose.yml
├── package.json               # root: concurrently dev script + install:all
├── backend/
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── index.ts           # Express app + static SPA serve
│       ├── config.ts          # env loading
│       ├── auth/              # google OAuth + cookie-session middleware
│       ├── db/                # schema.sql + better-sqlite3 client
│       ├── routes/            # auth, sessions, uploads, profile, scenarios, calendar, agent, export
│       ├── services/          # gemini client + helpers, google-calendar list
│       └── prompts/           # profile.md, scenarios.md, scheduler.md
└── frontend/
    ├── package.json
    ├── vite.config.ts         # /api → :3001 proxy in dev
    └── src/
        ├── main.tsx
        ├── App.tsx            # auth-aware shell + routes
        ├── auth/AuthContext.tsx
        ├── api/               # typed fetch wrappers per route group
        ├── lib/week.ts        # Monday-first week helpers
        ├── pages/             # Login, Upload, Workspace, Done
        └── components/
            ├── calendar/      # CalendarPane (react-big-calendar + DnD addon), AddEventModal
            └── scenario/      # ScenarioPane, AgentProposalBlock
```
