CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub    TEXT UNIQUE NOT NULL,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS google_tokens (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TEXT,
  scopes        TEXT,
  sync_events   INTEGER NOT NULL DEFAULT 0,
  sync_titles   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS microsoft_tokens (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id                     TEXT PRIMARY KEY,
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                 TEXT NOT NULL DEFAULT 'in_progress',
  current_scenario_index INTEGER NOT NULL DEFAULT 0,
  calendar_confirmed_at  TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at           TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS uploads (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('survey', 'scenarios')),
  original_filename TEXT NOT NULL,
  path              TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_uploads_session_id ON uploads(session_id);

CREATE TABLE IF NOT EXISTS scenarios (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id          TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  order_index         INTEGER NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  options_json        TEXT,
  context_events_json TEXT,
  prompt_summary      TEXT
);

CREATE INDEX IF NOT EXISTS idx_scenarios_session_id ON scenarios(session_id);

CREATE TABLE IF NOT EXISTS calendar_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source        TEXT NOT NULL,
  external_id   TEXT,
  title         TEXT NOT NULL,
  start_iso     TEXT NOT NULL,
  end_iso       TEXT NOT NULL,
  scenario_id   INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_session_id ON calendar_events(session_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_scenario_id ON calendar_events(scenario_id);

CREATE TABLE IF NOT EXISTS sync_tombstones (
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  deleted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, external_id)
);

CREATE TABLE IF NOT EXISTS scenario_answers (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id          TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  scenario_id         INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  user_event_id       INTEGER REFERENCES calendar_events(id) ON DELETE SET NULL,
  user_reason         TEXT NOT NULL,
  agent_event_id      INTEGER REFERENCES calendar_events(id) ON DELETE SET NULL,
  agent_reason        TEXT NOT NULL,
  user_decision       TEXT NOT NULL CHECK (user_decision IN ('accept', 'critique')),
  user_feedback       TEXT,
  user_actions_json   TEXT,
  agent_actions_json  TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scenario_answers_session_id ON scenario_answers(session_id);
