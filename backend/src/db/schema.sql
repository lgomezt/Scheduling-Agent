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
  participant_code       TEXT,
  study_version          TEXT,
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

CREATE TABLE IF NOT EXISTS survey_responses (
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL,
  answer_json  TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_session_id ON survey_responses(session_id);

CREATE TABLE IF NOT EXISTS model_profiles (
  session_id             TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  condition_id           TEXT NOT NULL,
  initial_profile        TEXT NOT NULL,
  initial_model_name     TEXT,
  initial_prompt_name    TEXT,
  initial_system_prompt_text TEXT,
  initial_system_prompt_hash TEXT,
  initial_prompt_payload TEXT NOT NULL,
  initial_raw_output     TEXT NOT NULL,
  initial_started_at     TEXT,
  initial_completed_at   TEXT,
  final_profile          TEXT,
  final_model_name       TEXT,
  final_prompt_name      TEXT,
  final_system_prompt_text TEXT,
  final_system_prompt_hash TEXT,
  final_prompt_payload   TEXT,
  final_raw_output       TEXT,
  final_started_at       TEXT,
  final_completed_at     TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, condition_id)
);

CREATE INDEX IF NOT EXISTS idx_model_profiles_session_id ON model_profiles(session_id);

CREATE TABLE IF NOT EXISTS scenario_user_responses (
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  scenario_id   TEXT NOT NULL,
  scenario_index INTEGER NOT NULL,
  ranking_json  TEXT NOT NULL,
  other_text    TEXT,
  reasoning     TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, scenario_id)
);

CREATE INDEX IF NOT EXISTS idx_scenario_user_responses_session_id ON scenario_user_responses(session_id);

CREATE TABLE IF NOT EXISTS model_scenario_outputs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id          TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  scenario_id         TEXT NOT NULL,
  scenario_index      INTEGER NOT NULL,
  condition_id        TEXT NOT NULL,
  display_label       TEXT NOT NULL CHECK (display_label IN ('A', 'B')),
  ranking_json        TEXT,
  reasoning           TEXT,
  model_name          TEXT,
  prompt_name         TEXT,
  system_prompt_text  TEXT,
  system_prompt_hash  TEXT,
  prompt_payload_json TEXT NOT NULL,
  raw_output          TEXT,
  parsed_output_json  TEXT,
  started_at          TEXT,
  completed_at        TEXT,
  latency_ms          INTEGER,
  error               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (session_id, scenario_id, condition_id),
  UNIQUE (session_id, scenario_id, display_label)
);

CREATE INDEX IF NOT EXISTS idx_model_scenario_outputs_session_id ON model_scenario_outputs(session_id);
CREATE INDEX IF NOT EXISTS idx_model_scenario_outputs_scenario_id ON model_scenario_outputs(session_id, scenario_id);

CREATE TABLE IF NOT EXISTS scenario_skips (
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  scenario_id    TEXT NOT NULL,
  scenario_index INTEGER NOT NULL,
  skipped_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, scenario_id)
);

CREATE INDEX IF NOT EXISTS idx_scenario_skips_session_id ON scenario_skips(session_id);

CREATE TABLE IF NOT EXISTS scenario_model_feedback (
  session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  scenario_id        TEXT NOT NULL,
  scenario_index     INTEGER NOT NULL,
  closer_choice      TEXT NOT NULL CHECK (closer_choice IN ('A', 'B', 'both', 'neither')),
  score_a            INTEGER NOT NULL CHECK (score_a BETWEEN 1 AND 5),
  score_b            INTEGER NOT NULL CHECK (score_b BETWEEN 1 AND 5),
  comment_a          TEXT NOT NULL,
  comment_b          TEXT NOT NULL,
  comparison_comment TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, scenario_id)
);

CREATE INDEX IF NOT EXISTS idx_scenario_model_feedback_session_id ON scenario_model_feedback(session_id);

CREATE TABLE IF NOT EXISTS profile_followup_assignments (
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  condition_id  TEXT NOT NULL,
  display_label TEXT NOT NULL CHECK (display_label IN ('A', 'B')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, condition_id),
  UNIQUE (session_id, display_label)
);

CREATE TABLE IF NOT EXISTS profile_followup_feedback (
  session_id     TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  responses_json TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
