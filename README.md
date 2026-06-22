# Scheduling Agent

A research platform for studying how well one full-information LLM scheduling agent can represent a participant's scheduling values, scenario rankings, reasoning, and final profile changes.

## Flow

1. Participant signs in with Google.
2. Participant answers the high-level scheduling preferences and values questionnaire.
3. Gemini generates one initial markdown participant profile from the full questionnaire.
4. For each scenario, the participant ranks all options, explains their reasoning, notes what they would clarify, and describes what changes could affect their ranking.
5. The single scheduling agent predicts the participant's ranking and gives a short reasoning explanation.
6. The participant scores how well the agent's reasoning reflects their values and leaves a comment.
7. After all scenarios, Gemini reconstructs a final profile from the initial profile plus scenario evidence.
8. The participant reviews the initial and final profiles side by side with added/deleted text highlighted, scores the final profile, comments on it, and then downloads the JSON study log.

## Tech

- **Frontend** - Vite, React 19, TypeScript, react-router, @tanstack/react-query, @dnd-kit, lucide-react. Dev port `5174`.
- **Backend** - Node 22, Express, TypeScript, better-sqlite3, cookie-session, @google/generative-ai, googleapis. Dev port `3010`.
- **Storage** - SQLite under `DATA_DIR` (defaults to `./data`).
- **Auth** - Google OAuth using `openid`, `email`, and `profile`.
- **LLM** - Gemini (default `gemini-2.0-flash-exp`). Scenario rankings use JSON responses; profiles use markdown responses.

## Data Reset

This branch uses a fresh single-agent schema. On startup, `backend/src/db/client.ts` checks SQLite `user_version`; if it does not match the active schema version, it drops the old app tables and recreates the active schema.

Active tables:

- `users`
- `sessions`
- `survey_responses`
- `model_profiles`
- `scenario_user_responses`
- `model_scenario_outputs`
- `scenario_skips`
- `scenario_agent_feedback`
- `final_profile_reflections`

## Setup

```bash
npm run install:all
cp backend/.env.example backend/.env
```

Fill in:

- `GEMINI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`

## Google OAuth Credentials

In the Google Cloud Console, create an OAuth 2.0 client of type **Web application**. For local dev:

- Authorized JavaScript origin: `http://localhost:5174`
- Authorized redirect URI: `http://localhost:5174/api/auth/google/callback`

For production, use the deployed domain and set `GOOGLE_REDIRECT_URI` and `PUBLIC_URL` accordingly.

## Run

```bash
npm run dev
```

Frontend is available at <http://localhost:5174>. Backend is available at <http://localhost:3010>. The Vite dev server proxies `/api/*` to the backend.

## Build And Serve

```bash
npm run build --prefix backend
npm run build --prefix frontend
PUBLIC_DIR=$(pwd)/frontend/dist npm start --prefix backend
```

## Directory Map

```text
Scheduling Agent/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── backend/
│   ├── package.json
│   └── src/
│       ├── index.ts
│       ├── config.ts
│       ├── auth/
│       ├── db/
│       ├── routes/            # auth, sessions, study config, survey, scenarios, reflection, export
│       ├── services/          # Gemini study calls
│       └── study/             # study config, response helpers, prompts
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── auth/
        ├── api/
        ├── components/study/
        └── pages/             # login, onboarding, survey, scenarios, reflection, complete
```
