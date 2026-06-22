CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub    TEXT UNIQUE NOT NULL,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id                     TEXT PRIMARY KEY,
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                 TEXT NOT NULL DEFAULT 'in_progress',
  current_scenario_index INTEGER NOT NULL DEFAULT 0,
  participant_code       TEXT,
  study_version          TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at           TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

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
  session_id                  TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  agent_id                    TEXT NOT NULL,
  initial_profile             TEXT NOT NULL,
  initial_model_name          TEXT,
  initial_prompt_name         TEXT,
  initial_system_prompt_text  TEXT,
  initial_system_prompt_hash  TEXT,
  initial_prompt_payload      TEXT NOT NULL,
  initial_raw_output          TEXT NOT NULL,
  initial_started_at          TEXT,
  initial_completed_at        TEXT,
  final_profile               TEXT,
  final_model_name            TEXT,
  final_prompt_name           TEXT,
  final_system_prompt_text    TEXT,
  final_system_prompt_hash    TEXT,
  final_prompt_payload        TEXT,
  final_raw_output            TEXT,
  final_started_at            TEXT,
  final_completed_at          TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scenario_user_responses (
  session_id                 TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  scenario_id                TEXT NOT NULL,
  scenario_index             INTEGER NOT NULL,
  ranking_json               TEXT NOT NULL,
  other_text                 TEXT,
  reasoning                  TEXT NOT NULL,
  information_needs          TEXT NOT NULL,
  conditional_change         TEXT NOT NULL,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, scenario_id)
);

CREATE INDEX IF NOT EXISTS idx_scenario_user_responses_session_id ON scenario_user_responses(session_id);

CREATE TABLE IF NOT EXISTS model_scenario_outputs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id          TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  scenario_id         TEXT NOT NULL,
  scenario_index      INTEGER NOT NULL,
  agent_id            TEXT NOT NULL,
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
  UNIQUE (session_id, scenario_id)
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

CREATE TABLE IF NOT EXISTS scenario_agent_feedback (
  session_id                 TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  scenario_id                TEXT NOT NULL,
  scenario_index             INTEGER NOT NULL,
  reasoning_alignment_score  INTEGER NOT NULL CHECK (reasoning_alignment_score BETWEEN 1 AND 5),
  comment                    TEXT NOT NULL,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, scenario_id)
);

CREATE INDEX IF NOT EXISTS idx_scenario_agent_feedback_session_id ON scenario_agent_feedback(session_id);

CREATE TABLE IF NOT EXISTS final_profile_reflections (
  session_id      TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  accuracy_score  INTEGER NOT NULL CHECK (accuracy_score BETWEEN 1 AND 5),
  comment         TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
