import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, "uploads"), { recursive: true });
fs.mkdirSync(path.join(config.dataDir, "profiles"), { recursive: true });

const dbPath = path.join(config.dataDir, "app.sqlite");
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

const tableInfo = (table: string) =>
  db.pragma(`table_info(${table})`) as Array<{ name: string }>;

const hasColumn = (table: string, column: string) =>
  tableInfo(table).some((c) => c.name === column);

if (!hasColumn("google_tokens", "scopes")) {
  db.exec("ALTER TABLE google_tokens ADD COLUMN scopes TEXT");
}
if (!hasColumn("google_tokens", "sync_events")) {
  db.exec("ALTER TABLE google_tokens ADD COLUMN sync_events INTEGER NOT NULL DEFAULT 0");
}
if (!hasColumn("google_tokens", "sync_titles")) {
  db.exec("ALTER TABLE google_tokens ADD COLUMN sync_titles INTEGER NOT NULL DEFAULT 1");
}
if (!hasColumn("scenarios", "context_events_json")) {
  db.exec("ALTER TABLE scenarios ADD COLUMN context_events_json TEXT");
}
if (!hasColumn("scenarios", "prompt_summary")) {
  db.exec("ALTER TABLE scenarios ADD COLUMN prompt_summary TEXT");
}
if (!hasColumn("scenario_answers", "user_actions_json")) {
  db.exec("ALTER TABLE scenario_answers ADD COLUMN user_actions_json TEXT");
}
if (!hasColumn("scenario_answers", "agent_actions_json")) {
  db.exec("ALTER TABLE scenario_answers ADD COLUMN agent_actions_json TEXT");
}
if (!hasColumn("sessions", "calendar_confirmed_at")) {
  db.exec("ALTER TABLE sessions ADD COLUMN calendar_confirmed_at TEXT");
}

const calendarTableSql = (
  db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='calendar_events'")
    .get() as { sql: string } | undefined
)?.sql ?? "";

if (calendarTableSql.includes("CHECK")) {
  console.log("[db] Migrating calendar_events to drop CHECK on source…");
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(`
    CREATE TABLE calendar_events__new (
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
    INSERT INTO calendar_events__new SELECT * FROM calendar_events;
    DROP TABLE calendar_events;
    ALTER TABLE calendar_events__new RENAME TO calendar_events;
    CREATE INDEX IF NOT EXISTS idx_calendar_events_session_id ON calendar_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_scenario_id ON calendar_events(scenario_id);
  `);
  db.exec("PRAGMA foreign_keys = ON;");
}
