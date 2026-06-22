import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaVersion = 5;
const appTables = [
  "final_profile_reflections",
  "profile_followup_feedback",
  "profile_followup_assignments",
  "scenario_agent_feedback",
  "scenario_model_feedback",
  "model_scenario_outputs",
  "scenario_user_responses",
  "scenario_skips",
  "scenario_answers",
  "calendar_events",
  "sync_tombstones",
  "model_profiles",
  "survey_responses",
  "uploads",
  "scenarios",
  "google_tokens",
  "microsoft_tokens",
  "sessions",
  "users",
];

fs.mkdirSync(config.dataDir, { recursive: true });

const dbPath = path.join(config.dataDir, "app.sqlite");
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
const currentVersion = db.pragma("user_version", { simple: true }) as number;

if (currentVersion !== schemaVersion) {
  db.pragma("foreign_keys = OFF");
  const dropSql = appTables.map((table) => `DROP TABLE IF EXISTS ${table};`).join("\n");
  db.exec(dropSql);
  db.exec(schema);
  db.pragma(`user_version = ${schemaVersion}`);
  db.pragma("foreign_keys = ON");
} else {
  db.exec(schema);
}
